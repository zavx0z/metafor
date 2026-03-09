import type { MatrixChanges } from "../matrix.t.ts"

/**
 * Внутреннее состояние CPU runtime.
 */
export interface CpuRuntimeState {
  states: Uint32Array
  bufferedChanges: MatrixChanges
}

/**
 * Backend-local контекст CPU runtime.
 */
export interface CpuRuntimeContext {
  heap: Uint32Array
  blockPtrs: number[]
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
}
