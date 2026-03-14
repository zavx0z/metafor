import type { MetaAST } from "@metafor/ast"
import type { GlobalTopologySnapshot, GlobalTopologyStore } from "./gravity/store.t"

export interface DarkStoreSnapshot {
  meta: Map<string, MetaAST>
  topology: GlobalTopologySnapshot
}

export interface DarkStore extends DarkStoreSnapshot {
  reset(): void
  restore(snapshot: DarkStoreSnapshot): void
  snapshot(): DarkStoreSnapshot
  setMeta(address: string, meta: MetaAST): MetaAST
  getMeta(address: string): MetaAST | undefined
  topology: GlobalTopologyStore
}
