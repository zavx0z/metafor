import type { MetaAST } from "@metafor/ast"
import type { UUID } from "./identifier.t"

export interface Atom {
  uuid: UUID
  path: string
  meta: string
}

export interface DarkStoreSnapshot {
  meta: Map<string, MetaAST>
  atom: Map<UUID, Atom>
}

export interface DarkStore extends DarkStoreSnapshot {
  reset(): void
  restore(snapshot: DarkStoreSnapshot): void
  snapshot(): DarkStoreSnapshot
  setMeta(address: string, meta: MetaAST): MetaAST
  setAtom(atom: Atom): Atom
  getMeta(address: string): MetaAST | undefined
  getAtom(uuid: UUID): Atom | undefined
  getPath(uuid: UUID): string | undefined
  getChildren(parent: UUID | null): readonly Atom[]
  getNode(path: string): Atom | null
}
