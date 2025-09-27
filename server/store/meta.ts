import path from "node:path"
import { Database, Statement } from "bun:sqlite"
import fs from "node:fs/promises"
import { pathToFileURL } from "node:url"
import type { MetaStore } from "../../core/store.t"
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

/** Сериализация с поддержкой RegExp */
function serializeWithRegExp(value: any): string {
  return JSON.stringify(value, (key, val) => {
    if (val instanceof RegExp) {
      return { __type: "RegExp", source: val.source, flags: val.flags }
    }
    return val
  })
}

/** Десериализация с поддержкой RegExp */
function deserializeWithRegExp(json: string): any {
  return JSON.parse(json, (key, val) => {
    if (val && typeof val === "object" && val.__type === "RegExp") {
      return new RegExp(val.source, val.flags)
    }
    return val
  })
}

/** Прочитать модуль как текст и выполнить его для получения default export. */
// async function readModuleDefaultFromFile(filePath: string): Promise<any> {
//   const file = Bun.file(filePath)
//   const text = await file.text()
//
//   // Создаём временный файл для выполнения модуля
//   const tempFile = `/tmp/temp-module-${Date.now()}.js`
//   const wrappedCode = text
//
//   try {
//     await Bun.write(tempFile, wrappedCode)
//     const module = await import(tempFile)
//     return module.default
//   } finally {
//     // Удаляем временный файл
//     try {
//       await fs.unlink(tempFile)
//     } catch {
//       // Игнорируем ошибки удаления
//     }
//   }
// }
/**
 * Серверное хранилище модулей (SQLite). Храним декларативное значение как JSON.
 */
export async function MetaStore(dbFile = "meta.db"): Promise<MetaStore> {
  const dbPath = path.resolve(dbFile)
  const db = new Database(dbPath)
  db.run("PRAGMA journal_mode=WAL;")
  db.run("PRAGMA synchronous=FULL;")
  // Простое создание таблиц без миграций (dev-режим)
  db.run(`CREATE TABLE IF NOT EXISTS module
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

  const stmtGetMeta: Statement<[string]> = db.query(`SELECT size FROM module WHERE src = ?;`)
  const stmtGetSchema: Statement<[string]> = db.query(`SELECT value FROM schema WHERE src = ?;`)
  const stmtDel: Statement<[string]> = db.query(`DELETE FROM module WHERE src = ?;`)
  const stmtDelSchema: Statement<[string]> = db.query(`DELETE FROM schema WHERE src = ?;`)

  return {
    info() {
      return { kind: "server", dbPath, table: "module" }
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
          return s ? deserializeWithRegExp(s.value) : null
        }
        const mod = await importModuleDefaultFromFile(filePath, size)
        const value = mod?.default
        if (shouldSave) {
          const now = Date.now()
          db.run(`INSERT INTO schema(src, value) VALUES (?, ?) ON CONFLICT(src) DO UPDATE SET value=excluded.value;`, [
            id,
            serializeWithRegExp(value),
          ])
          db.run(
            `INSERT INTO module(src, size, updatedAt) VALUES (?, ?, ?) ON CONFLICT(src) DO UPDATE SET size=excluded.size, updatedAt=excluded.updatedAt;`,
            [id, size, now]
          )
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
