import type { MatrixStore } from "./store.ts"

export type WeakBackendPreference = "cpu" | "gpu" | "auto"
export type WeakMode = "cpu" | "gpu"
export type WeakStepMode = 1 | 2

export type WeakHeapUpdate =
  | {kind: "field"; braneIndex: number; fieldIndex: number}
  | {kind: "lock"; braneIndex: number; value: boolean}

export interface WeakChanges extends Array<[number, number]> {}

export interface WeakRuntime {
  step(mode?: WeakStepMode): void
  readChanges(): Promise<WeakChanges>
  heapUpdate(updates: WeakHeapUpdate[]): void
  /** Optional backend-local refresh; weakReconfigure falls back to recreation. */
  reconfigure?(): void
  clear(): void
  statesSnapshot(): number[]
}

export interface WeakRuntimeSelection {
  mode: WeakMode
  runtime: WeakRuntime
}

export interface WeakStore {
  runtime: WeakRuntime | null
  operationMutex: Promise<void> | null
  initialized: boolean
  mode: WeakMode
  matrix$: MatrixStore | null
  stateMetaStateIdsByBraneIndex: number[][]
  stateHasProcessByBraneIndex: boolean[][]
  dispose(): void
}

export interface WeakStateExport {
  heap: Uint32Array
  blockPtrs: number[]
  heapAllocOffset: number
  arrayReserveSize: number
  arrayDataInvalidated: boolean
}
