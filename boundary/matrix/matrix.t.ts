import type { MatrixMode } from "./store.t.ts"

export interface MatrixHeapUpdate {
  offset: number
  value1: number
  value2?: number
}

export type MatrixChanges = Array<[number, number]>

export interface MatrixRuntime {
  step(): void
  readChanges(): Promise<MatrixChanges>
  heapUpdate(updates: MatrixHeapUpdate[]): void
  clear(): void
  statesSnapshot(): number[]
}

export interface MatrixRuntimeSelection {
  mode: MatrixMode
  runtime: MatrixRuntime
}

export interface MatrixStateExport {
  heap: Uint32Array
  blockPtrs: number[]
  heapAllocOffset: number
  arrayReserveSize: number
  arrayDataInvalidated: boolean
}
