import {SQL} from "bun"
import {StoreMetaSqlite} from "@store/meta/sqlite"
import {StoreActorSqlite} from "@store/actor/sqlite"
import type {ServerStore} from "./server.t.ts"

export const open = async (filename?: string): Promise<ServerStore> => {
  const fileBacked = filename !== undefined && filename !== ":memory:"

  const sql = new SQL(fileBacked ? `sqlite://${filename}` : "sqlite::memory:")
  await sql.unsafe("PRAGMA foreign_keys = ON;")
  if (fileBacked) {
    await sql.unsafe("PRAGMA journal_mode = WAL;")
    await sql.unsafe("PRAGMA synchronous = NORMAL;")
    await sql.unsafe("PRAGMA busy_timeout = 5000;")
  }

  return {
    sql,
    meta: await StoreMetaSqlite.open(sql),
    actor: await StoreActorSqlite.open(sql),
    async close() {
      try {
        if (fileBacked) await sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE);")
        await sql.close()
      } catch {
        // ignore double-close
      }
    },
  }
}
