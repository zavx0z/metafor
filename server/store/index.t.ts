import type { Database } from "bun:sqlite"

export interface ActorRecord {
  id: number
  meta_tag: string
  parent_id: number | null
  idx: number
  snapshot: string
  timestamp: string
}

export type TransactionCallback = (db: Database) => void

export * from "./index"
