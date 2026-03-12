/**
 * `@dark/em` — projection/export contract подготовленного graph state.
 *
 * Использует синглтон `dark$` для проекций в Boundary и Bulk.
 */

import type { MetaAST } from "@metafor/ast"
import { dark$ } from "../store"
import type { DarkGraphNode } from "../store.t.ts"

export type DarkConsumer = "boundary" | "bulk"

export interface DarkDownstreamProjection {
  consumer: DarkConsumer
  schemaPath: string
  sourcePath?: string | undefined
  ast: MetaAST
  graph: typeof dark$
  root: DarkGraphNode
}

export function projectDarkGraph(consumer: DarkConsumer): DarkDownstreamProjection {
  const root = dark$.getNode([])
  if (!root) {
    throw new Error("Dark graph is not initialized.")
  }

  return {
    consumer,
    schemaPath: dark$.schemaPath,
    sourcePath: dark$.sourcePath,
    ast: dark$.ast,
    graph: dark$,
    root,
  }
}

export function projectDarkGraphToBoundary(): DarkDownstreamProjection {
  return projectDarkGraph("boundary")
}

export function projectDarkGraphToBulk(): DarkDownstreamProjection {
  return projectDarkGraph("bulk")
}
