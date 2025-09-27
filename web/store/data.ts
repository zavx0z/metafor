import type { DataStore } from "../../core/store.t"

/**
 * Веб DataStore (IndexedDB)
 *
 * Заглушка для работы с данными в браузере.
 * В будущем будет реализован полноценный CRUD для IndexedDB.
 */
export async function DataStore(): Promise<DataStore> {
  return {
    async get(table: string, id: string): Promise<any | null> {
      throw new Error(`DataStore.get not implemented for web: ${table}.${id}`)
    },
    async getAll(table: string): Promise<any[] | null> {
      throw new Error(`DataStore.getAll not implemented for web: ${table}`)
    },
    async update(table: string, id: string, data: any): Promise<void> {
      throw new Error(`DataStore.update not implemented for web: ${table}.${id}`)
    },
    async insert(table: string, data: any): Promise<void> {
      throw new Error(`DataStore.insert not implemented for web: ${table}`)
    },
    async delete(table: string, id: string): Promise<void> {
      throw new Error(`DataStore.delete not implemented for web: ${table}.${id}`)
    },
    async drop(table: string): Promise<void> {
      throw new Error(`DataStore.drop not implemented for web: ${table}`)
    },
  }
}
