import type { MatrixMode } from "./store.t.ts"

export type MatrixHeapUpdate =
  | {
      kind: "field"
      braneIndex: number
      fieldIndex: number
    }
  | {
      kind: "lock"
      braneIndex: number
      value: boolean
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
