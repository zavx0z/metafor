/**
 * `gravity$` — долгоживущее addressing/composition-хранилище Boundary.
 *
 * Оно не дублирует `shared/db`-данные и не хранит materialized runtime payload.
 * Его задача — держать UUID-композицию и текущее соответствие `uuid <-> braneIndex`
 * для уже собранного `boundary$`.
 */

export type { BoundaryGravityStore } from "./gravity.store.t.ts"
import type { BoundaryGravityStore } from "./gravity.store.t.ts"

export const gravity$: BoundaryGravityStore = {
  activeWimpIds: [],
  wimpIdToBraneIndex: new Map(),
  braneIndexToWimpId: [],
  structuralDirty: false,

  hasWimp(wimpId: string): boolean {
    return this.activeWimpIds.includes(wimpId)
  },

  getBraneIndex(wimpId: string): number | undefined {
    return this.wimpIdToBraneIndex.get(wimpId)
  },

  getWimpId(braneIndex: number): string | undefined {
    return this.braneIndexToWimpId[braneIndex]
  },
}
