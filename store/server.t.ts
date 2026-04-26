import type { Database } from "bun:sqlite"

export interface OpenServerStoreOptions {
  /** Путь к SQLite-файлу. По умолчанию `:memory:`. */
  filename?: string
}

export interface ServerStore {
  readonly database: Database
  close(): void
}
