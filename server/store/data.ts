import type { DataStore } from "../../core/store.t"

/**
 * Серверный DataStore (SQLite)
 *
 * Заглушка для работы с данными на сервере.
 * В будущем будет реализован полноценный CRUD для SQLite.
 */
export async function DataStore(): Promise<DataStore> {
  return {
    async get(table: string, id: string): Promise<any | null> {
      throw new Error(`DataStore.get not implemented for server: ${table}.${id}`)
    },
    async getAll(table: string): Promise<any[] | null> {
      throw new Error(`DataStore.getAll not implemented for server: ${table}`)
    },
    async update(table: string, id: string, data: any): Promise<void> {
      throw new Error(`DataStore.update not implemented for server: ${table}.${id}`)
    },
    async insert(table: string, data: any): Promise<void> {
      throw new Error(`DataStore.insert not implemented for server: ${table}`)
    },
    async delete(table: string, id: string): Promise<void> {
      throw new Error(`DataStore.delete not implemented for server: ${table}.${id}`)
    },
    async drop(table: string): Promise<void> {
      throw new Error(`DataStore.drop not implemented for server: ${table}`)
    },
  }
}
