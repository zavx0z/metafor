import type { MetaApi } from "../store/index.ts"

let metaDbContext:
  | {
      db: unknown
      store: { meta: MetaApi }
      loaded: Set<string>
    }
  | undefined

export async function getMetaDbContext(): Promise<{
  db: unknown
  store: { meta: MetaApi }
  loaded: Set<string>
} | null> {
  if (typeof Bun === "undefined") return null

  if (!metaDbContext) {
    const { SQL } = await import("bun")
    const { StoreMetaSqlite } = await import("@store/meta/sqlite")
    const db = new SQL("sqlite::memory:")
    await db.unsafe("PRAGMA foreign_keys = ON;")
    const meta = await StoreMetaSqlite.open(db)
    metaDbContext = {
      db,
      store: { meta },
      loaded: new Set<string>(),
    }
  }

  return metaDbContext
}

export function disposeMetaDbContext(): void {
  const current = metaDbContext
  metaDbContext = undefined

  if (!current?.db || typeof current.db !== "object") return
  const close = (current.db as { close?: (throwOnError?: boolean) => void }).close
  if (typeof close === "function") close.call(current.db, false)
}
