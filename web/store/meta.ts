import type { MetaStore, LoadPolicy } from "../../core/store.t"

/**
 * Web Store (IndexedDB)
 *
 * - objectStore `module` (keyPath: src) — метаданные: { src, size, updatedAt }
 * - objectStore `schema` (keyPath: src) — декларативное значение (schema): { src, value }
 * - Политики: cache-first, network-first, network-only, cache-only, stale-while-revalidate
 * - Сравнение изменений: по точному размеру JS (u8.byteLength)
 */
export async function MetaStore(dbName = "meta", storeName = "module"): Promise<MetaStore> {
  /** Преобразует Uint8Array в «чистый» ArrayBuffer-срез. */
  function u8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
  }

  /** Открыть/создать IndexedDB. */
  function openDB(name: string, store: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "src" })
        }
        if (!db.objectStoreNames.contains("schema")) {
          db.createObjectStore("schema", { keyPath: "src" })
        }
      }
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
    })
  }

  /** Получить запись из object store. */
  function get(db: IDBDatabase, store: string, id: string): Promise<any | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly")
      tx.onerror = () => reject(tx.error)
      const rq = tx.objectStore(store).get(id)
      rq.onsuccess = () => resolve(rq.result || null)
      rq.onerror = () => reject(rq.error)
    })
  }

  /** Прочитать только размер из стора метаданных. */
  function getSize(db: IDBDatabase, store: string, src: string): Promise<number | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly")
      tx.onerror = () => reject(tx.error)
      const rq = tx.objectStore(store).get(src)
      rq.onsuccess = () => {
        const rec = rq.result
        resolve(rec && typeof rec.size === "number" ? rec.size : null)
      }
      rq.onerror = () => reject(rq.error)
    })
  }

  /** Удалить запись из object store. */
  function del(db: IDBDatabase, store: string, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite")
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(store).delete(id)
    })
  }

  /** Удалить базу данных. */
  function deleteDB(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const rq = indexedDB.deleteDatabase(name)
      rq.onsuccess = () => resolve()
      rq.onblocked = () => resolve()
      rq.onerror = () => reject(rq.error)
    })
  }

  /** Импорт ESM из Uint8Array через blob:URL. */
  async function importFromUint8AsModule(u8: Uint8Array): Promise<{ default: any }> {
    const blob = new Blob([u8ToArrayBuffer(u8)], { type: "text/javascript" })
    const url = URL.createObjectURL(blob)
    return import(url).finally(() => URL.revokeObjectURL(url))
  }

  /** Загрузить по url и вернуть как Uint8Array. */
  async function fetchAsUint8(url: string): Promise<Uint8Array> {
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
      return { kind: "web" as const, dbName, storeName }
    },

    async remove(id: string): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([storeName, "schema"], "readwrite")
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.objectStore(storeName).delete(id)
        tx.objectStore("schema").delete(id)
      })
    },

    async import(src: string, policy: LoadPolicy = "cache-first"): Promise<any | null> {
      const url = new URL(src, location.origin).toString()

      // Поддерживаем политики в стиле Service Worker
      // cache-first: сначала кэш; если нет — сеть с сохранением
      // network-first: пробуем сеть; при ошибке/отсутствии сети — кэш
      // network-only: всегда сеть, БД не трогаем
      // cache-only: только кэш, без сети
      // stale-while-revalidate: мгновенно кэш (если есть), параллельно обновляем кэш из сети (без ожидания)

      const fromCache = async (): Promise<any | null> => {
        const schemaRec = await get(db, "schema", src)
        return schemaRec ? schemaRec.value : null
      }

      /**
       * Загрузить по сети, сверить размер с кэшем и при совпадении вернуть кэш без импорта.
       * При различии — импортировать и (опционально) сохранить.
       */
      const fetchAndOptionallySave = async (shouldSave: boolean): Promise<any | null> => {
        const u8 = await fetchAsUint8(url)
        const cachedSize = await getSize(db, storeName, src)
        if (cachedSize != null && cachedSize === u8.byteLength) {
          const schemaRec = await get(db, "schema", src)
          return schemaRec ? schemaRec.value : null
        }
        // Размер изменился (или кэша нет) — импортируем и при необходимости сохраняем
        const mod = await importFromUint8AsModule(u8)
        const value = mod?.default
        if (shouldSave) {
          const now = Date.now()
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction([storeName, "schema"], "readwrite")
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
            tx.objectStore(storeName).put({ src, size: u8.byteLength, updatedAt: now })
            tx.objectStore("schema").put({ src, value })
          })
        }
        return value
      }

      switch (policy) {
        case "network-only": {
          return fetchAndOptionallySave(false)
        }
        case "cache-only": {
          return await fromCache()
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

    async drop(): Promise<void> {
      db.close()
      await deleteDB(dbName)
    },
  }
}
