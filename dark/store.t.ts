import type { MetaAST } from "@metafor/ast"

export interface Atom {
  path: string
  meta: string
  address: string
}

export interface DarkStoreSnapshot {
  meta: Map<string, MetaAST>
  atom: Map<string, Atom>
}

export interface DarkStore extends DarkStoreSnapshot {
  reset(): void
  restore(snapshot: DarkStoreSnapshot): void
  snapshot(): DarkStoreSnapshot
  setMeta(address: string, meta: MetaAST): MetaAST
  setAtom(atom: Atom): Atom
  getMeta(address: string): MetaAST | undefined
  getAtom(address: string): Atom | undefined
  getPath(address: string): string | undefined
  getChildren(parent: string | null): readonly Atom[]
  getNode(path: string): Atom | null
}
