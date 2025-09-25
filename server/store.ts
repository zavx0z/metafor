import path from "node:path"
import { Database, Statement } from "bun:sqlite"
import fs from "node:fs/promises"
import { pathToFileURL } from "node:url"
import type { MetaRecord, MetaStore } from "../core/store/index.t"

/** Получить абсолютный путь к файлу модуля: <cwd>/${id}.js */
function getModuleFilePath(id: string): string {
  return path.resolve(process.cwd(), `${id}`)
}

/** Прочитать размер файла без чтения содержимого. */
async function getModuleFileSize(filePath: string): Promise<number> {
  const st = await fs.stat(filePath)
  return st.size
}

/** Импортировать модуль напрямую с диска. Для инвалидации кеша добавляем query с токеном. */
async function importModuleDefaultFromFile(filePath: string, bustToken: string | number): Promise<{ default: any }> {
  const href = pathToFileURL(filePath).href + `?v=${bustToken}`
  return import(href) as Promise<{ default: any }>
}

/**
 * Серверное хранилище модулей (SQLite). Храним декларативное значение как JSON.
 */
export async function Store(dbFile = "meta.db", table = "modules"): Promise<MetaStore> {
  const dbPath = path.resolve(dbFile)
  const db = new Database(dbPath)
  db.run("PRAGMA journal_mode=WAL;")
  db.run("PRAGMA synchronous=FULL;")
  // Гарантируем json_valid(value) через миграцию в транзакции
  db.run("BEGIN;")
  try {
    db.run(`CREATE TABLE IF NOT EXISTS ${table}
            (
                id        TEXT PRIMARY KEY,
                value     TEXT    NOT NULL CHECK (json_valid(value)),
                size      INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL
            );`)

    // Пересоздание таблицы со STRICT-проверкой JSON при необходимости
    db.run(`CREATE TABLE IF NOT EXISTS __${table}_new
            (
                id        TEXT PRIMARY KEY,
                value     TEXT    NOT NULL CHECK (json_valid(value)),
                size      INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL
            );`)
    db.run(`INSERT INTO __${table}_new(id, value, size, updatedAt)
            SELECT id,
                   CASE WHEN json_valid(value) THEN value ELSE json(value) END,
                   size,
                   updatedAt
            FROM ${table};`)
    db.run(`DROP TABLE IF EXISTS ${table};`)
    db.run(`ALTER TABLE __${table}_new RENAME TO ${table};`)
    db.run("COMMIT;")
  } catch (e) {
    db.run("ROLLBACK;")
    throw e
  }

  const stmtGet: Statement<[string]> = db.query(
    `SELECT value, size, updatedAt
     FROM ${table}
     WHERE id = ?;`
  )
  const stmtUpsert: Statement<[string, string, number, number]> = db.query(
    `INSERT INTO ${table}(id, value, size, updatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET value=excluded.value,
                                   size=excluded.size,
                                   updatedAt=excluded.updatedAt;`
  )
  const stmtDel: Statement<[string]> = db.query(
    `DELETE
     FROM ${table}
     WHERE id = ?;`
  )

  function getRow(id: string): MetaRecord | null {
    const row = stmtGet.get(id) as { value: string; size: number; updatedAt: number } | null
    if (!row) return null
    // Парсим JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(row.value)
    } catch {
      parsed = null
    }
    return { id, value: parsed, updatedAt: row.updatedAt, size: row.size }
  }

  async function importFromStore(id: string): Promise<{ default: any } | null> {
    const rec = getRow(id)
    if (!rec) return null
    return { default: rec.value }
  }

  return {
    info() {
      return { kind: "server", dbPath, table }
    },

    async upsert(id, content, sizeBytes?) {
      const json = JSON.stringify(content)
      const size = typeof sizeBytes === "number" ? sizeBytes : Buffer.byteLength(json, "utf8")
      stmtUpsert.run(id, json, size, Date.now())
      const rec = getRow(id)
      if (!rec) throw new Error(`UPSERT_FAILED:"${id}"`)
      return rec.size
    },

    async remove(id) {
      stmtDel.run(id)
    },

    /**
     * Импорт модуля из стора с политикой загрузки.
     */
    async import(id, policy = "cache-first") {
      const fromCache = async () => {
        const rec = getRow(id)
        if (!rec) return null
        return { default: rec.value }
      }

      const readAndOptionallySave = async (shouldSave: boolean) => {
        const filePath = getModuleFilePath(id)
        try {
          await fs.access(filePath)
        } catch {
          console.error(`MODULE_NOT_FOUND:"${id}" at ${filePath}`)
          throw new Error(`MODULE_NOT_FOUND:"${id}"`)
        }
        const size = await getModuleFileSize(filePath)
        const cached = getRow(id)
        if (cached && typeof cached.size === "number" && cached.size === size) {
          return { default: cached.value }
        }
        const mod = await importModuleDefaultFromFile(filePath, size)
        const value = mod?.default
        if (shouldSave) {
          const now = Date.now()
          stmtUpsert.run(id, JSON.stringify(value), size, now)
        }
        return { default: value }
      }

      switch (policy) {
        case "network-only": {
          return readAndOptionallySave(false)
        }
        case "cache-only": {
          return await fromCache()
        }
        case "network-first": {
          try {
            return await readAndOptionallySave(true)
          } catch (e) {
            const mod = await fromCache()
            if (mod) return mod
            throw e
          }
        }
        case "stale-while-revalidate": {
          const cached = await fromCache()
          // непрерывно обновляем кэш, не ожидая
          readAndOptionallySave(true).catch(() => {})
          if (cached) return cached
          return readAndOptionallySave(true)
        }
        case "cache-first":
        default: {
          const cached = await fromCache()
          if (cached) return cached
          return readAndOptionallySave(true)
        }
      }
    },

    async drop() {
      db.close()
      await fs.rm(dbPath, { force: true })
    },
  }
}
