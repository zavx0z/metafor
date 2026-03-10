/**
 * @boundary/boundary/store — canonical global Boundary store.
 *
 * @packageDocumentation
 */

export type { BoundaryStore, BoundaryData } from "./store.t.ts"
import type { BoundaryStore } from "./store.t.ts"

export const boundary$: BoundaryStore = {
  fields: [],
  stringTable: [""],
  sharedBlocks: [],
  branes: [],
  states: [],

  reset() {
    this.fields = []
    this.stringTable = [""]
    this.sharedBlocks = []
    this.branes = []
    this.states = []
  },

  restore(state: BoundaryStore) {
    this.fields = state.fields
    this.stringTable = state.stringTable
    this.sharedBlocks = state.sharedBlocks
    this.branes = state.branes
    this.states = state.states
  },
}
