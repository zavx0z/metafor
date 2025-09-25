import path from "node:path"
import { Database, Statement } from "bun:sqlite"
import fs from "node:fs/promises"
import { pathToFileURL } from "node:url"
import type { MetaStore } from "../core/store.t"
/**
 * Серверный Store (SQLite)
 *
 * - Таблица `module(src TEXT PK, size INTEGER, updatedAt INTEGER)`
 * - Таблица `schema(src TEXT PK, value TEXT CHECK(json_valid(value)))`
 * - Ключ: `src`
 * - Размер: байты исходного JS‑модуля (fs.stat().size)
 * - Импорт: читаем размер файла, сравниваем с кэшем; при совпадении отдаём сохранённое значение,
 *   иначе выполняем ESM‑импорт (с query‑токеном `?v=size` для обхода кеша загрузчика), сохраняем value и size.
 */

/** Получить абсолютный путь к файлу модуля */
function getModuleFilePath(src: string): string {
  // file:// URL → путь
  if (src.startsWith("file://")) return new URL(src).pathname
  // Абсолютный http(s) URL не поддерживаем как локальный путь
  if (/^https?:\/\//.test(src)) throw new Error(`HTTP_URL_NOT_SUPPORTED:"${src}"`)
  // Абсолютный веб-путь "/x/y.js" → <cwd>/x/y.js
  if (src.startsWith("/")) return path.join(process.cwd(), src.slice(1))
  // Относительный путь или имя → резолвим от <cwd>
  return path.resolve(process.cwd(), src)
}

/** Прочитать размер файла без чтения содержимого. */
async function getModuleFileSize(filePath: string): Promise<number> {
  const st = await fs.stat(filePath)
  return st.size
}

/** Импортировать модуль напрямую с диска. Добавляем query-токен, чтобы обойти кеш загрузчика ESM. */
async function importModuleDefaultFromFile(filePath: string, bustToken: string | number): Promise<{ default: any }> {
  const href = pathToFileURL(filePath).href + `?v=${bustToken}`
  return import(href) as Promise<{ default: any }>
}

/**
 * Серверное хранилище модулей (SQLite). Храним декларативное значение как JSON.
 */
export async function Store(dbFile = "meta.db", table = "module"): Promise<MetaStore> {
  const dbPath = path.resolve(dbFile)
  const db = new Database(dbPath)
  db.run("PRAGMA journal_mode=WAL;")
  db.run("PRAGMA synchronous=FULL;")
  // Простое создание таблиц без миграций (dev-режим)
  db.run(`CREATE TABLE IF NOT EXISTS ${table}
          (
              src       TEXT PRIMARY KEY,
              size      INTEGER NOT NULL,
              updatedAt INTEGER NOT NULL
          );`)
  db.run(`CREATE TABLE IF NOT EXISTS schema
          (
              src   TEXT PRIMARY KEY,
              value TEXT NOT NULL CHECK (json_valid(value))
          );`)

  const stmtGetMeta: Statement<[string]> = db.query(`SELECT size FROM ${table} WHERE src = ?;`)
  const stmtGetSchema: Statement<[string]> = db.query(`SELECT value FROM schema WHERE src = ?;`)
  const stmtUpsertMeta: Statement<[string, number, number]> = db.query(
    `INSERT INTO ${table}(src, size, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(src) DO UPDATE SET size=excluded.size,
                                   updatedAt=excluded.updatedAt;`
  )
  const stmtUpsertSchema: Statement<[string, string]> = db.query(
    `INSERT INTO schema(src, value)
     VALUES (?, ?)
     ON CONFLICT(src) DO UPDATE SET value=excluded.value;`
  )
  const stmtDel: Statement<[string]> = db.query(`DELETE FROM ${table} WHERE src = ?;`)
  const stmtDelSchema: Statement<[string]> = db.query(`DELETE FROM schema WHERE src = ?;`)

  // getRow(): больше не собираем агрегат из двух таблиц — читаем по назначению отдельно

  return {
    info() {
      return { kind: "server", dbPath, table }
    },

    async upsert(id, content, sizeBytes?) {
      const json = JSON.stringify(content)
      const size = typeof sizeBytes === "number" ? sizeBytes : Buffer.byteLength(json, "utf8")
      const now = Date.now()
      stmtUpsertSchema.run(id, json)
      stmtUpsertMeta.run(id, size, now)
      const meta = stmtGetMeta.get(id) as { size: number } | null
      if (!meta) throw new Error(`UPSERT_FAILED:"${id}"`)
      return meta.size
    },

    async remove(id) {
      db.run("BEGIN;")
      try {
        stmtDel.run(id)
        stmtDelSchema.run(id)
        db.run("COMMIT;")
      } catch (e) {
        db.run("ROLLBACK;")
        throw e
      }
    },

    /**
     * Импорт модуля из стора с политикой загрузки.
     */
    async import(id, policy = "cache-first") {
      const fromCache = async () => {
        const row = stmtGetSchema.get(id) as { value: string } | null
        if (!row) return null
        try {
          return JSON.parse(row.value)
        } catch {
          return null
        }
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
        const cached = stmtGetMeta.get(id) as { size: number } | null
        if (cached && typeof cached.size === "number" && cached.size === size) {
          const s = stmtGetSchema.get(id) as { value: string } | null
          return s ? JSON.parse(s.value) : null
        }
        const mod = await importModuleDefaultFromFile(filePath, size)
        const value = mod?.default
        if (shouldSave) {
          const now = Date.now()
          stmtUpsertSchema.run(id, JSON.stringify(value))
          stmtUpsertMeta.run(id, size, now)
        }
        return value
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
