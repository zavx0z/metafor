import type { Database } from "bun:sqlite"

export interface ActorRecord {
  id: number
  meta_tag: string
  parent_id: number | null
  idx: number
  snapshot: string
  timestamp: string
}

export interface PatchRecord {
  id: number
  actor_id: number
  op: string
  path: string
  value: string | null
  timestamp: string
}

export type TransactionCallback = (db: Database) => void

export interface ActorTreeNode extends Omit<ActorRecord, "parent_id" | "idx"> {
  children: ActorTreeNode[]
}

export * from "./index"
