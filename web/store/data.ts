import type { DataStore, ContextSchema } from "../../core/store.t"

/**
 * Веб DataStore (IndexedDB)
 *
 * Универсальный стор для работы с данными в браузере.
 * Создает object stores динамически по Context Schema.
 * - Object Store: `{table}` с полями по схеме
 * - Поддержка составных ключей
 * - Автоматическое создание индексов
 */
export async function DataStore(dbName: string): Promise<DataStore> {
  let db: IDBDatabase
  let dbVersion = 1

  // Кеш object store names
  const storeNames = new Set<string>()

  // Кеш схем для таблиц
  const schemas = new Map<string, ContextSchema>()

  // Получить текущую версию базы данных
  const getCurrentVersion = (): Promise<number> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const currentDb = request.result
        const version = currentDb.version
        currentDb.close()
        resolve(version)
      }
    })
  }

  // Получить id поля из схемы
  const getIdFields = (schema: ContextSchema): string[] => {
    return Object.entries(schema)
      .filter(([_, fieldSchema]) => fieldSchema.id === true)
      .map(([fieldName, _]) => fieldName)
  }

  // Создать составной ключ из данных
  const createCompositeKey = (data: any, idFields: string[]): string => {
    if (idFields.length === 1) {
      return String(data[idFields[0]!] || "")
    }
    return idFields.map((field) => String(data[field] || "")).join("|")
  }

  // Фильтровать данные по запросу
  const filterData = (data: any[], query: Record<string, any>): any[] => {
    return data.filter((item) => {
      return Object.entries(query).every(([key, value]) => {
        return item[key] === value
      })
    })
  }

  // Создать object store если не существует
  const ensureStore = async (table: string, schema: ContextSchema): Promise<void> => {
    if (!storeNames.has(table)) {
      // Если store уже существует, просто добавляем в кеш
      if (db.objectStoreNames.contains(table)) {
        storeNames.add(table)
        return
      }

      // Создаем новый object store
      return new Promise((resolve, reject) => {
        db.close()
        dbVersion++

        const request = indexedDB.open(dbName, dbVersion)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          db = request.result
          storeNames.add(table)
          resolve()
        }
        request.onupgradeneeded = (event) => {
          const newDb = (event.target as IDBOpenDBRequest).result

          // Определить keyPath для object store
          const idFields = getIdFields(schema)
          let keyPath: string | string[] | null = null

          if (idFields.length === 1) {
            keyPath = idFields[0]!
          } else if (idFields.length > 1) {
            keyPath = idFields
          } else {
            // Если нет id полей, не используем keyPath (автогенерация ключей)
            keyPath = null
          }

          const storeOptions: IDBObjectStoreParameters = {}
          if (keyPath !== null) {
            storeOptions.keyPath = keyPath
          } else {
            storeOptions.autoIncrement = true
          }

          const store = newDb.createObjectStore(table, storeOptions)

          // Создать индексы для полей с id: true (кроме keyPath)
          Object.entries(schema).forEach(([fieldName, fieldSchema]) => {
            if (fieldSchema.id && idFields.length > 1) {
              // Для составных ключей создаем индекс на каждое поле
              store.createIndex(fieldName, fieldName, { unique: false })
            }
          })
        }
      })
    }
  }

  // Инициализировать базу данных
  const initDb = async (): Promise<void> => {
    try {
      // Получить текущую версию базы
      const currentVersion = await getCurrentVersion()
      dbVersion = currentVersion
    } catch {
      // База не существует, используем версию 1
      dbVersion = 1
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        db = request.result
        resolve()
      }
      request.onupgradeneeded = (event) => {
        // База создается, но object stores создаются динамически
      }
    })
  }

  // Инициализировать базу
  await initDb()

  return {
    async createTableIfNotExist(table: string, schema: ContextSchema): Promise<void> {
      await ensureStore(table, schema)
      schemas.set(table, schema)
    },

    async get(table: string, query: Record<string, any>): Promise<any | null> {
      const schema = schemas.get(table)
      if (!schema) {
        throw new Error(`Table ${table} not created with schema. Use createTableIfNotExist first.`)
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readonly")
        const store = transaction.objectStore(table)
        const request = store.getAll()
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const results = request.result
          const parsed = results.filter(Boolean)

          // Найти первую запись, соответствующую запросу
          const found = parsed.find((item) => {
            return Object.entries(query).every(([key, value]) => {
              return item[key] === value
            })
          })

          resolve(found || null)
        }
      })
    },

    async getAll(table: string, query?: Record<string, any>): Promise<any[]> {
      const schema = schemas.get(table)
      if (!schema) {
        throw new Error(`Table ${table} not created with schema. Use createTableIfNotExist first.`)
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readonly")
        const store = transaction.objectStore(table)
        const request = store.getAll()
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const results = request.result
          const parsed = results.filter(Boolean)

          // Если есть фильтр, применяем его
          if (query) {
            const filtered = filterData(parsed, query)
            resolve(filtered)
          } else {
            resolve(parsed)
          }
        }
      })
    },

    async update(table: string, query: Record<string, any>, data: any): Promise<void> {
      const schema = schemas.get(table)
      if (!schema) {
        throw new Error(`Table ${table} not created with schema. Use createTableIfNotExist first.`)
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readwrite")
        const store = transaction.objectStore(table)

        // Сначала получаем все данные для поиска
        const getRequest = store.getAll()
        getRequest.onerror = () => reject(getRequest.error)
        getRequest.onsuccess = () => {
          const results = getRequest.result
          const parsed = results.filter(Boolean)

          // Найти запись для обновления
          const found = parsed.find((item) => {
            return Object.entries(query).every(([key, value]) => {
              return item[key] === value
            })
          })

          if (!found) {
            reject(new Error(`Record not found for update`))
            return
          }

          const updatedData = { ...found, ...data }

          const putRequest = store.put(updatedData)
          putRequest.onerror = () => reject(putRequest.error)
          putRequest.onsuccess = () => resolve()
        }
      })
    },

    async insert(table: string, data: any): Promise<void> {
      const schema = schemas.get(table)
      if (!schema) {
        throw new Error(`Table ${table} not created with schema. Use createTableIfNotExist first.`)
      }

      // Применить значения по умолчанию из схемы
      const processedData = { ...data }
      Object.entries(schema).forEach(([fieldName, fieldSchema]) => {
        if (processedData[fieldName] === undefined && fieldSchema.default !== undefined) {
          processedData[fieldName] = fieldSchema.default
        }
      })

      const idFields = getIdFields(schema)

      // Если нет id полей в схеме, не добавляем id (IndexedDB автогенерирует ключ)
      if (idFields.length > 0) {
        // Генерируем ID для id полей если не указаны
        idFields.forEach((idField) => {
          if (!processedData[idField]) {
            processedData[idField] = `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }
        })
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readwrite")
        const store = transaction.objectStore(table)

        // Для object stores с autoIncrement используем add(), иначе put()
        const idFields = getIdFields(schema)
        const request =
          idFields.length === 0
            ? store.add(processedData) // Автогенерация ключа
            : store.put(processedData) // Используем существующий ключ

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    },

    async delete(table: string, query: Record<string, any>): Promise<void> {
      const schema = schemas.get(table)
      if (!schema) {
        throw new Error(`Table ${table} not created with schema. Use createTableIfNotExist first.`)
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([table], "readwrite")
        const store = transaction.objectStore(table)

        // Сначала получаем все данные для поиска
        const getRequest = store.getAll()
        getRequest.onerror = () => reject(getRequest.error)
        getRequest.onsuccess = () => {
          const results = getRequest.result
          const parsed = results.filter(Boolean)

          // Найти записи для удаления
          const toDelete = parsed.filter((item) => {
            return Object.entries(query).every(([key, value]) => {
              return item[key] === value
            })
          })

          if (toDelete.length === 0) {
            resolve()
            return
          }

          // Удаляем найденные записи
          let completed = 0
          toDelete.forEach((item) => {
            const idFields = getIdFields(schema)
            let key: any

            if (idFields.length === 1) {
              key = item[idFields[0]!]
            } else {
              key = idFields.map((field) => item[field])
            }

            const deleteRequest = store.delete(key)
            deleteRequest.onerror = () => reject(deleteRequest.error)
            deleteRequest.onsuccess = () => {
              completed++
              if (completed === toDelete.length) {
                resolve()
              }
            }
          })
        }
      })
    },

    async drop(table: string): Promise<void> {
      return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(table)) {
          resolve()
          return
        }

        db.close()
        dbVersion++

        const request = indexedDB.open(dbName, dbVersion)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          db = request.result
          storeNames.delete(table)
          schemas.delete(table)
          resolve()
        }
        request.onupgradeneeded = (event) => {
          const newDb = (event.target as IDBOpenDBRequest).result
          newDb.deleteObjectStore(table)
        }
      })
    },
  }
}
