/** @typedef {import('../core/store/index.t').MetaRecord} MetaRecord */
/**
 * Web-хранилище модулей (IndexedDB). Храним декларативное значение (schema) из module.default.
 * При import(id): если записи нет — модуль подтягивается из ./<id>.js, извлекается default и сохраняется в БД.
 * @param {string} [dbName="meta"]
 * @param {string} [storeName="modules"]
 * @returns {Promise<import("../core/store/index.t").MetaStore>}
 */
export async function Store(dbName = "meta", storeName = "modules") {
  /**
   * Преобразует Uint8Array в «чистый» ArrayBuffer-срез.
   *
   * @param {Uint8Array} u8 - исходный буфер
   * @returns {ArrayBuffer} - выделенный ArrayBuffer
   */
  function u8ToArrayBuffer(u8) {
    return /** @type {ArrayBuffer} */ (u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength))
  }

  /**
   * Открыть/создать IndexedDB.
   * @param {string} name
   * @param {string} store
   * @returns {Promise<IDBDatabase>}
   */
  function openDB(name, store) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" })
        }
        if (!db.objectStoreNames.contains("schema")) {
          db.createObjectStore("schema", { keyPath: "id" })
        }
      }
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
    })
  }

  /**
   * @param {IDBDatabase} db
   * @param {string} store
   * @param {MetaRecord} record
   * @returns {Promise<void>}
   */
  function put(db, store, record) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite")
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(store).put(record)
    })
  }

  /**
   * @param {IDBDatabase} db
   * @param {string} store
   * @param {string} id
   * @returns {Promise<MetaRecord|null>}
   */
  function get(db, store, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly")
      tx.onerror = () => reject(tx.error)
      const rq = tx.objectStore(store).get(id)
      rq.onsuccess = () => resolve(rq.result || null)
      rq.onerror = () => reject(rq.error)
    })
  }

  /**
   * @param {IDBDatabase} db
   * @param {string} store
   * @param {string} id
   * @returns {Promise<void>}
   */
  function del(db, store, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite")
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(store).delete(id)
    })
  }

  /**
   * Записать метаданные и схему в одной транзакции.
   * @param {IDBDatabase} db
   * @param {string} metaStore
   * @param {string} schemaStore
   * @param {string} id
   * @param {unknown} value
   * @param {number} size
   * @param {number} updatedAt
   * @returns {Promise<void>}
   */
  function putBoth(db, metaStore, schemaStore, id, value, size, updatedAt) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([metaStore, schemaStore], "readwrite")
      tx.oncomplete = () => resolve(undefined)
      tx.onerror = () => reject(tx.error)
      tx.objectStore(metaStore).put({ id, size, updatedAt })
      tx.objectStore(schemaStore).put({ id, value })
    })
  }

  /**
   * @param {string} name
   * @returns {Promise<void>}
   */
  function deleteDB(name) {
    return new Promise((resolve, reject) => {
      const rq = indexedDB.deleteDatabase(name)
      rq.onsuccess = () => resolve()
      rq.onblocked = () => resolve()
      rq.onerror = () => reject(rq.error)
    })
  }

  /**
   * Импорт ESM из Uint8Array через blob:URL.
   * @param {Uint8Array} u8
   * @returns {Promise<{ default: any }>}
   */
  async function importFromUint8AsModule(u8) {
    const blob = new Blob([u8ToArrayBuffer(u8)], { type: "text/javascript" })
    const url = URL.createObjectURL(blob)
    return import(url).finally(() => URL.revokeObjectURL(url))
  }

  /**
   * Загрузить по url и вернуть как Uint8Array.
   * @param {string} url
   * @returns {Promise<Uint8Array>}
   */
  async function fetchAsUint8(url) {
    // const url = new URL(url, location.origin).toString()
    const resp = await fetch(url, { cache: "no-cache" })
    if (!resp.ok) {
      console.error(`FETCH_FAILED:${resp.status} for ${url}`)
      throw new Error(`FETCH_FAILED:${resp.status}`)
    }
    return new Uint8Array(await resp.arrayBuffer())
  }

  const db = await openDB(dbName, storeName)
  return {
    info() {
      return { kind: "web", dbName, storeName }
    },

    async upsert(id, content, sizeBytes) {
      // Сохраняем декларативное значение в отдельном store `schema` и метаданные в `${storeName}`
      const size = typeof sizeBytes === "number" ? sizeBytes : 0
      await putBoth(db, storeName, "schema", id, content, size, Date.now())
      const rec = await get(db, storeName, id)
      if (!rec) throw new Error(`UPSERT_FAILED:"${id}"`)
      return typeof rec.size === "number" ? rec.size : size
    },

    async remove(id) {
      await del(db, storeName, id)
    },

    /**
     * @param {string} src
     * @param {import("../core/store/index.t").LoadPolicy} [policy]
     */
    async import(src, policy = "cache-first") {
      const url = new URL(src, location.origin).toString()

      // Поддерживаем политики в стиле Service Worker
      // cache-first: сначала кэш; если нет — сеть с сохранением
      // network-first: пробуем сеть; при ошибке/отсутствии сети — кэш
      // network-only: всегда сеть, БД не трогаем
      // cache-only: только кэш, без сети
      // stale-while-revalidate: мгновенно кэш (если есть), параллельно обновляем кэш из сети (без ожидания)

      const fromCache = async () => {
        const rec = await get(db, storeName, src)
        if (!rec) return null
        const schemaRec = await get(db, "schema", src)
        return { default: schemaRec ? schemaRec.value : undefined }
      }

      /**
       * Загрузить по сети, сверить размер с кэшем и при совпадении вернуть кэш без импорта.
       * При различии — импортировать и (опционально) сохранить.
       * @param {boolean} shouldSave
       */
      const fetchAndOptionallySave = async (shouldSave) => {
        const u8 = await fetchAsUint8(url)
        const cached = await get(db, storeName, src)
        if (cached && typeof cached.size === "number" && cached.size === u8.byteLength) {
          const schemaRec = await get(db, "schema", src)
          return { default: schemaRec ? schemaRec.value : undefined }
        }
        // Размер изменился (или кэша нет) — импортируем и при необходимости сохраняем
        const mod = await importFromUint8AsModule(u8)
        const value = mod?.default
        if (shouldSave) {
          const now = Date.now()
          await putBoth(db, storeName, "schema", src, value, u8.byteLength, now)
        }
        return { default: value }
      }

      switch (policy) {
        case "network-only": {
          return fetchAndOptionallySave(false)
        }
        case "cache-only": {
          const mod = await fromCache()
          return mod
        }
        case "network-first": {
          try {
            // сеть с сохранением
            return await fetchAndOptionallySave(true)
          } catch (e) {
            // на случай оффлайна — кэш
            const mod = await fromCache()
            if (mod) return mod
            throw e
          }
        }
        case "stale-while-revalidate": {
          const cached = await fromCache()
          // Параллельно обновляем кэш, но результат не ждём
          fetchAndOptionallySave(true).catch(() => {})
          if (cached) return cached
          // если кэша нет — ждём сеть и сохраняем
          return fetchAndOptionallySave(true)
        }
        case "cache-first":
        default: {
          const cached = await fromCache()
          if (cached) return cached
          return fetchAndOptionallySave(true)
        }
      }
    },

    async drop() {
      db.close()
      await deleteDB(dbName)
    },
  }
}
