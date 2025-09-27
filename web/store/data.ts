import type { DataStore } from "../../core/store.t"

/**
 * Веб DataStore (IndexedDB)
 *
 * Универсальный стор для работы с данными в браузере.
 * Создает object stores динамически по требованию.
 * - Object Store: `{table}` с ключом `id`
 * - Значение: JSON с данными
 */
export async function DataStore(dbName: string): Promise<DataStore> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      // Object stores создаются динамически в ensureStore
    }
  })

  // Кеш object store names
  const storeNames = new Set<string>()

  // Создать object store если не существует
  const ensureStore = async (table: string): Promise<void> => {
    if (!storeNames.has(table)) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readwrite")
        transaction.onerror = () => reject(transaction.error)
        transaction.oncomplete = () => {
          storeNames.add(table)
          resolve()
        }
        // Если store не существует, создаем его
        if (!db.objectStoreNames.contains(table)) {
          db.close()
          const request = indexedDB.open(dbName, 2)
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const newDb = request.result
            newDb.close()
            // Переоткрываем с версией 1
            const reopenRequest = indexedDB.open(dbName, 1)
            reopenRequest.onerror = () => reject(reopenRequest.error)
            reopenRequest.onsuccess = () => {
              const finalDb = reopenRequest.result
              finalDb.close()
              resolve()
            }
          }
          request.onupgradeneeded = (event) => {
            const newDb = (event.target as IDBOpenDBRequest).result
            newDb.createObjectStore(table, { keyPath: "id" })
          }
        } else {
          resolve()
        }
      })
    }
  }

  return {
    async get(table: string, id: string): Promise<any | null> {
      await ensureStore(table)
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readonly")
        const store = transaction.objectStore(table)
        const request = store.get(id)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const result = request.result
          if (!result) {
            resolve(null)
            return
          }
          try {
            resolve(result.value ? JSON.parse(result.value) : result)
          } catch {
            resolve(result)
          }
        }
      })
    },

    async getAll(table: string): Promise<any[] | null> {
      await ensureStore(table)
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readonly")
        const store = transaction.objectStore(table)
        const request = store.getAll()
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const results = request.result
          const parsed = results.map((result) => {
            try {
              return { id: result.id, ...JSON.parse(result.value) }
            } catch {
              return { id: result.id, value: result.value || result }
            }
          })
          resolve(parsed)
        }
      })
    },

    async update(table: string, id: string, data: any): Promise<void> {
      await ensureStore(table)
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readwrite")
        const store = transaction.objectStore(table)
        const value = JSON.stringify(data)
        const request = store.put({ id, value })
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    },

    async insert(table: string, data: any): Promise<void> {
      await ensureStore(table)
      if (!data.id) {
        throw new Error(`DataStore.insert: data must have "id" field`)
      }
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readwrite")
        const store = transaction.objectStore(table)
        const value = JSON.stringify(data)
        const request = store.put({ id: data.id, value })
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    },

    async delete(table: string, id: string): Promise<void> {
      await ensureStore(table)
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readwrite")
        const store = transaction.objectStore(table)
        const request = store.delete(id)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    },

    async drop(table: string): Promise<void> {
      await ensureStore(table)
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readwrite")
        const store = transaction.objectStore(table)
        const request = store.clear()
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          storeNames.delete(table)
          resolve()
        }
      })
    },
  }
}
