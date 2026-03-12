import type { MonadJson } from "@metafor/ast"

export type DarkGraphPath = readonly string[]
export type DarkGraphLookup = string | DarkGraphPath
export type DarkGraphNodeKind = "root" | "section" | "object" | "array" | "value"
export type DarkGraphSection = "root" | "name" | "fields" | "superposition" | "processes" | "reactions" | "bulk" | "mass"

export interface DarkGraphNode {
  kind: DarkGraphNodeKind
  section: DarkGraphSection
  key: string
  address: string
  path: DarkGraphPath
  parentAddress: string | null
  childAddresses: string[]
  value: unknown
}

export interface DarkStoreInput {
  schemaPath: string
  ast: MonadJson
  dsl?: unknown
  sourcePath?: string | undefined
}

export interface DarkStoreSnapshot extends DarkStoreInput {
  nodes: DarkGraphNode[]
}

export interface DarkStore extends DarkStoreSnapshot {
  linkedFlat: DarkGraphNode[]
  reset(): void
  restore(state: DarkStoreInput | DarkStoreSnapshot): void
  getNode(target: DarkGraphLookup): DarkGraphNode | undefined
  getChildren(target: DarkGraphLookup): DarkGraphNode[]
  lookup(target: DarkGraphLookup): DarkGraphNode[]
}
