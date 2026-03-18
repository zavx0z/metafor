import type { DarkGraph } from "@dark/types"
import { graph$ } from "../store.ts"

export function resetGraph(): void {
  graph$.clear()
}

export function clearGraph(): void {
  graph$.clear()
}

export function snapshotGraph(): DarkGraph {
  return structuredClone({
    roots: graph$.roots,
    particles: graph$.particles,
    parent: graph$.parent,
    meta: graph$.meta,
  })
}

export function restoreGraph(snapshot: DarkGraph): void {
  graph$.clear()
  graph$.roots = structuredClone(snapshot.roots)
  graph$.particles = structuredClone(snapshot.particles)
  graph$.parent = structuredClone(snapshot.parent)
  graph$.meta = structuredClone(snapshot.meta)
}
