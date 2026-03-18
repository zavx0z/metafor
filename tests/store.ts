import type { DarkGraph } from "@dark/types"

export interface DarkGraphStore extends DarkGraph {
  clear(): void
}

export const graph$: DarkGraphStore = {
  roots: new Set(),
  particles: new Map(),
  parent: new Map(),
  meta: new Map(),

  clear() {
    this.roots.clear()
    this.particles.clear()
    this.parent.clear()
    this.meta.clear()
  },
}
