let metaDbContext:
  | {
      db: unknown
      loaded: Set<string>
    }
  | undefined

export async function getMetaDbContext(): Promise<{ db: unknown; loaded: Set<string> } | null> {
  if (typeof Bun === "undefined") return null

  if (!metaDbContext) {
    const { SQL } = await import("bun")
    const { StoreMetaSqlite } = await import("@store/meta/sqlite")
    const db = new SQL("sqlite::memory:")
    await db.unsafe("PRAGMA foreign_keys = ON;")
    await StoreMetaSqlite.open(db)
    metaDbContext = {
      db,
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
