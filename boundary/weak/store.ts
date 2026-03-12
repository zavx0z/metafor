/** `@boundary/weak/runtime/store` хранит локальное runtime-состояние слабой силы. */

import type { WeakStore } from "./store.t.ts"

export const weak$: WeakStore = {
  runtime: null,
  operationMutex: null,
  initialized: false,
  mode: "cpu",
  boundary$: null,

  reset() {
    if (this.runtime) {
      this.runtime.clear()
    }
    this.runtime = null
    this.operationMutex = null
    this.initialized = false
    this.mode = "cpu"
    this.boundary$ = null
  },
}
