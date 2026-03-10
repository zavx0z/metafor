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
  sharedValues: [],
  branes: [],
  braneValues: [],
  braneSharedBlockRefs: [],
  stateTable: [],
  transitions: [],
  conditions: [],
  states: [],

  reset() {
    this.fields = []
    this.stringTable = [""]
    this.sharedBlocks = []
    this.sharedValues = []
    this.branes = []
    this.braneValues = []
    this.braneSharedBlockRefs = []
    this.stateTable = []
    this.transitions = []
    this.conditions = []
    this.states = []
  },

  restore(state) {
    this.fields = state.fields
    this.stringTable = state.stringTable
    this.sharedBlocks = state.sharedBlocks
    this.sharedValues = state.sharedValues
    this.branes = state.branes
    this.braneValues = state.braneValues
    this.braneSharedBlockRefs = state.braneSharedBlockRefs
    this.stateTable = state.stateTable
    this.transitions = state.transitions
    this.conditions = state.conditions
    this.states = state.states
  },
}
