import type { MatrixChanges } from "../matrix.t.ts"

/**
 * Внутреннее состояние CPU runtime.
 */
export interface CpuRuntimeState {
  states: Uint32Array
  bufferedChanges: MatrixChanges
}
