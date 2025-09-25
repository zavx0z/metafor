import path from "node:path"
import { Database, Statement } from "bun:sqlite"
import fs from "node:fs/promises"
import crypto from "node:crypto"
import { pathToFileURL } from "node:url"
import type { MetaRecord, MetaStore } from "../core/store/index.t"

/**
 * Импорт ESM из Uint8Array через файл-кэш (.meta-modcache).
 */
async function importFromUint8AsModule(code: Uint8Array, id: string): Promise<{ default: any }> {
  const cacheDir = path.join(process.cwd(), ".meta-modcache")
  await fs.mkdir(cacheDir, { recursive: true })
  const file = path.join(cacheDir, `${sanitize(id)}-${hash(code)}.mjs`)
  await fs.writeFile(file, code)
  return import(pathToFileURL(file).href) as Promise<{ default: any }>
}

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_")
const hash = (u8: Uint8Array) => crypto.createHash("sha256").update(u8).digest("hex").slice(0, 16)

/**
 * Прочитать модуль из КОРНЯ проекта: <cwd>/${id}.js → Uint8Array.
 */
async function readModuleFromRootAsUint8(id: string): Promise<Uint8Array> {
  const filePath = path.resolve(process.cwd(), `${id}.js`)
  const file = Bun.file(filePath)
  const exists = await file.exists()
  if (!exists) {
    console.error(`MODULE_NOT_FOUND:"${id}" at ${filePath}`)
    throw new Error(`MODULE_NOT_FOUND:"${id}"`)
  }
  const buf = await file.bytes()
  return new Uint8Array(buf)
}

/**
 * Серверное хранилище модулей (SQLite). Единый формат: Uint8Array.
 */
export async function Store(dbFile = "meta.db", table = "modules"): Promise<MetaStore> {
  const dbPath = path.resolve(dbFile)
  const db = new Database(dbPath)
  db.run("PRAGMA journal_mode=WAL;")
  db.run("PRAGMA synchronous=FULL;")
  db.run(`CREATE TABLE IF NOT EXISTS ${table}
          (
              id        TEXT PRIMARY KEY,
              blob      BLOB    NOT NULL,
              updatedAt INTEGER NOT NULL
          );`)

  const stmtGet: Statement<[string]> = db.query(
    `SELECT blob, updatedAt
     FROM ${table}
     WHERE id = ?;`
  )
  const stmtUpsert: Statement<[string, Uint8Array, number]> = db.query(
    `INSERT INTO ${table}(id, blob, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET blob=excluded.blob,
                                   updatedAt=excluded.updatedAt;`
  )
  const stmtDel: Statement<[string]> = db.query(
    `DELETE
     FROM ${table}
     WHERE id = ?;`
  )

  function getRow(id: string): MetaRecord | null {
    const row = stmtGet.get(id) as { blob: Uint8Array; updatedAt: number } | null
    if (!row) return null
    // Копия для изоляции
    return { id, blob: new Uint8Array(row.blob), updatedAt: row.updatedAt }
  }

  async function importFromStore(id: string): Promise<{ default: any } | null> {
    const rec = getRow(id)
    if (!rec) return null
    return importFromUint8AsModule(rec.blob, id)
  }

  return {
    info() {
      return { kind: "server", dbPath, table }
    },

    async upsert(id, content) {
      if (!(content instanceof Uint8Array)) {
        console.error("upsert: content must be Uint8Array")
        throw new TypeError("CONTENT_NOT_UINT8ARRAY")
      }
      stmtUpsert.run(id, content, Date.now())
      const rec = getRow(id)
      if (!rec) throw new Error(`UPSERT_FAILED:"${id}"`)
      return rec.blob.byteLength
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
        return importFromUint8AsModule(rec.blob, id)
      }

      const readAndOptionallySave = async (shouldSave: boolean) => {
        const u8 = await readModuleFromRootAsUint8(id)
        if (shouldSave) {
          const now = Date.now()
          stmtUpsert.run(id, u8, now)
        }
        return importFromUint8AsModule(u8, id)
      }

      switch (policy) {
        case "network-only": {
          return readAndOptionallySave(false)
        }
        case "cache-only": {
          const mod = await fromCache()
          return mod
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
