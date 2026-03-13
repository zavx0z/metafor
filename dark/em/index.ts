/**
 * `@dark/em` — projection/export contract подготовленного graph state.
 *
 * Использует синглтон `dark$` для проекций в Boundary и Bulk.
 */

import type { MetaAST } from "@metafor/ast"
import { dark$ } from "../store"
import type { Atom } from "../store"

export type DarkConsumer = "boundary" | "bulk"

export interface DarkDownstreamProjection {
  consumer: DarkConsumer
  graph: typeof dark$
  meta: Map<string, MetaAST>
  atom: Atom[]
}

export function projectDarkGraph(consumer: DarkConsumer): DarkDownstreamProjection {
  return {
    consumer,
    graph: dark$,
    meta: new Map(dark$.meta),
    atom: [...dark$.atom.values()],
  }
}

export function projectDarkGraphToBoundary(): DarkDownstreamProjection {
  return projectDarkGraph("boundary")
}

export function projectDarkGraphToBulk(): DarkDownstreamProjection {
  return projectDarkGraph("bulk")
}
