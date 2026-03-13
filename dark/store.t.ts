import type { MetaAST } from "@metafor/ast"
import type { Atom } from "./gravity/store.t.js"

export type { Atom } from "./gravity/store.t.js"

export interface DarkStoreSnapshot {
  meta: Map<string, MetaAST>
  atom: Map<string, Atom>
}

export interface DarkStore extends DarkStoreSnapshot {
  reset(): void
  snapshot(): DarkStoreSnapshot
  setMeta(address: string, meta: MetaAST): MetaAST
  getMeta(address: string): MetaAST | undefined
  getAtom(address: string): Atom | undefined
  getPath(address: string): string
  getChildren(parent: string | null): readonly Atom[]
  getNode(path: string): Atom | null
}
