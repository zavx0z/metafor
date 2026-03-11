/** `@boundary/matrix/store` хранит общее runtime-состояние Matrix. */

import type { MatrixStore } from "./store.t.ts"

/** Runtime-состояние `@boundary/matrix`, общее для CPU и GPU реализаций. */
export const matrix$: MatrixStore = {
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
