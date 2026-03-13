/**
 * `@dark/em` — projection/export contract подготовленного graph state.
 *
 * Использует синглтон `dark$` для проекций в Boundary и Bulk.
 */

import { dark$ } from "../store"
import type { Atom } from "../store"

export type DarkConsumer = "boundary" | "bulk"

export interface DarkDownstreamProjection {
  consumer: DarkConsumer
  graph: typeof dark$
  atom: Atom[]
}

export function projectDarkGraph(consumer: DarkConsumer): DarkDownstreamProjection {
  return {
    consumer,
    graph: dark$,
    atom: [...dark$.atom.values()],
  }
}

export function projectDarkGraphToBoundary(): DarkDownstreamProjection {
  return projectDarkGraph("boundary")
}

export function projectDarkGraphToBulk(): DarkDownstreamProjection {
  return projectDarkGraph("bulk")
}
