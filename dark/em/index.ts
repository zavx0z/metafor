/**
 * `@dark/em` — projection/export contract подготовленного graph state.
 */

import type { ActorAST } from "@metafor/ast"
import type { DarkGraphNode, DarkStore } from "../store.t.ts"

export type DarkConsumer = "boundary" | "bulk"

export interface DarkDownstreamProjection {
  consumer: DarkConsumer
  schemaPath: string
  sourcePath?: string | undefined
  ast: ActorAST
  graph: DarkStore
  root: DarkGraphNode
}

export function projectDarkGraph(store: DarkStore, consumer: DarkConsumer): DarkDownstreamProjection {
  const root = store.getNode([])
  if (!root) {
    throw new Error("Dark graph is not initialized.")
  }

  return {
    consumer,
    schemaPath: store.schemaPath,
    sourcePath: store.sourcePath,
    ast: store.ast,
    graph: store,
    root,
  }
}

export function projectDarkGraphToBoundary(store: DarkStore): DarkDownstreamProjection {
  return projectDarkGraph(store, "boundary")
}

export function projectDarkGraphToBulk(store: DarkStore): DarkDownstreamProjection {
  return projectDarkGraph(store, "bulk")
}
