/**
 * `@dark/em` — projection/export contract подготовленного graph state.
 *
 * Использует синглтон `dark$` для проекций в Boundary и Bulk.
 */

import type { MetaAST } from "@metafor/ast"
import { dark$ } from "../store"
import type { GlobalTopologyPlacement, GlobalTopologyReference, GlobalTopologyEntanglement } from "../ap/store.t"

export type DarkConsumer = "boundary" | "bulk"

export interface DarkDownstreamProjection {
  consumer: DarkConsumer
  meta: Map<string, MetaAST>
  placements: GlobalTopologyPlacement[]
  references: GlobalTopologyReference[]
  entanglements: GlobalTopologyEntanglement[]
}

export function projectDarkGraph(consumer: DarkConsumer): DarkDownstreamProjection {
  return {
    consumer,
    meta: new Map(dark$.meta),
    placements: Array.from(dark$.topology.placements.values()),
    references: Array.from(dark$.topology.references.values()),
    entanglements: Array.from(dark$.topology.entanglements.values()),
  }
}

export function projectDarkGraphToBoundary(): DarkDownstreamProjection {
  return projectDarkGraph("boundary")
}

export function projectDarkGraphToBulk(): DarkDownstreamProjection {
  return projectDarkGraph("bulk")
}
