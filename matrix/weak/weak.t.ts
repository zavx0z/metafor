import type { WeakMode } from "./store.t.ts"
import type { StepMode as WeakStepMode } from "./constants.ts"

export type WeakHeapUpdate =
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

export type WeakChanges = Array<[number, number]>

export interface WeakRuntime {
  step(mode?: WeakStepMode): void
  readChanges(): Promise<WeakChanges>
  heapUpdate(updates: WeakHeapUpdate[]): void
  clear(): void
  statesSnapshot(): number[]
}

export interface WeakRuntimeSelection {
  mode: WeakMode
  runtime: WeakRuntime
}

export interface WeakStateExport {
  heap: Uint32Array
  blockPtrs: number[]
  heapAllocOffset: number
  arrayReserveSize: number
  arrayDataInvalidated: boolean
}
