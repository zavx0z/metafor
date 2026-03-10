/**
 * @boundary/matrix/state — runtime state для matrix.
 *
 * @packageDocumentation
 */

import type { MatrixStore } from "./store.t.ts"

/**
 * Matrix runtime state.
 */
export const store: MatrixStore = {
  runtime: null,
  operationMutex: null,
  initialized: false,
  mode: "cpu",
  boundary: null,
}

/**
 * Reset matrix store state.
 */
export function matrixStoreReset(): void {
  store.runtime = null
  store.operationMutex = null
  store.initialized = false
  store.mode = "cpu"
  store.boundary = null
}
