import path from "node:path"
import { Database, Statement } from "bun:sqlite"
import type { DataStore } from "../../core/store.t"

/**
 * Серверный DataStore (SQLite)
 *
 * Универсальный стор для работы с данными на сервере.
 * Создает таблицы динамически по требованию.
 * - Таблица `{table}(id TEXT PK, value TEXT CHECK(json_valid(value)))`
 * - Ключ: `id` (идентификатор записи)
 * - Значение: JSON с данными
 */
export async function DataStore(dbFile: string): Promise<DataStore> {
  const dbPath = path.resolve(dbFile)
  const db = new Database(dbPath)
  db.run("PRAGMA journal_mode=WAL;")
  db.run("PRAGMA synchronous=NORMAL;")

  // Кеш prepared statements для каждой таблицы
  const statements = new Map<
    string,
    {
      get: Statement<[string]>
      getAll: Statement<[]>
      update: Statement<[string, string, string]>
      insert: Statement<[string, string]>
      delete: Statement<[string]>
      drop: Statement<[]>
    }
  >()

  // Создать таблицу если не существует
  const ensureTable = (table: string) => {
    if (!statements.has(table)) {
      db.run(`CREATE TABLE IF NOT EXISTS ${table}
              (
                  id    TEXT PRIMARY KEY,
                  value TEXT NOT NULL CHECK (json_valid(value))
              );`)

      statements.set(table, {
        get: db.query(`SELECT value FROM ${table} WHERE id = ?;`),
        getAll: db.query(`SELECT id, value FROM ${table};`),
        update: db.query(`UPDATE ${table} SET value = ? WHERE id = ?;`),
        insert: db.query(`INSERT INTO ${table}(id, value) VALUES (?, ?);`),
        delete: db.query(`DELETE FROM ${table} WHERE id = ?;`),
        drop: db.query(`DROP TABLE IF EXISTS ${table};`),
      })
    }
  }

  return {
    async get(table: string, id: string): Promise<any | null> {
      ensureTable(table)
      const stmt = statements.get(table)!
      const row = stmt.get.get(id) as { value: string } | null
      if (!row) return null
      try {
        return JSON.parse(row.value)
      } catch {
        return null
      }
    },

    async getAll(table: string): Promise<any[] | null> {
      ensureTable(table)
      const stmt = statements.get(table)!
      const rows = stmt.getAll.all() as unknown as { id: string; value: string }[]
      return rows.map((row) => {
        try {
          return { id: row.id, ...JSON.parse(row.value) }
        } catch {
          return { id: row.id, value: null }
        }
      })
    },

    async update(table: string, id: string, data: any): Promise<void> {
      ensureTable(table)
      const stmt = statements.get(table)!
      const value = JSON.stringify({ id, ...data })
      stmt.update.run(value, id)
    },

    async insert(table: string, data: any): Promise<void> {
      ensureTable(table)
      const stmt = statements.get(table)!
      if (!data.id) {
        throw new Error(`DataStore.insert: data must have "id" field`)
      }
      const value = JSON.stringify(data)
      stmt.insert.run(data.id, value)
    },

    async delete(table: string, id: string): Promise<void> {
      ensureTable(table)
      const stmt = statements.get(table)!
      stmt.delete.run(id)
    },

    async drop(table: string): Promise<void> {
      ensureTable(table)
      const stmt = statements.get(table)!
      stmt.drop.run()
      statements.delete(table)
    },
  }
}
