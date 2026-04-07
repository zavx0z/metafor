let metaDbContext:
  | {
      db: unknown
      loaded: Set<string>
    }
  | undefined

export async function getMetaDbContext(): Promise<{ db: unknown; loaded: Set<string> } | null> {
  if (typeof Bun === "undefined") return null

  if (!metaDbContext) {
    const { getMetaDB } = await import("../pkg/sqlite/index.ts")
    metaDbContext = {
      db: getMetaDB(":memory:"),
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
