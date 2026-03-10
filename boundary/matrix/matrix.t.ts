import type { MatrixMode } from "./store.t.ts"

/**
 * Точечное обновление слова в heap.
 */
export interface MatrixHeapUpdate {
  offset: number
  value1: number
  value2?: number
}

/**
 * Список изменившихся состояний бран.
 */
export type MatrixChanges = Array<[number, number]>

/**
 * Единый контракт runtime матрицы.
 */
export interface MatrixRuntime {
  step(): void
  readChanges(): Promise<MatrixChanges>
  heapUpdate(updates: MatrixHeapUpdate[]): void
  clear(): void
  statesSnapshot(): Uint32Array
}

/**
 * Результат выбора runtime.
 */
export interface MatrixRuntimeSelection {
  mode: MatrixMode
  runtime: MatrixRuntime
}

/**
 * Состояние Matrix для сериализации.
 */
export interface MatrixStateExport {
  heap: Uint32Array
  blockPtrs: number[]
  heapAllocOffset: number
  arrayReserveSize: number
  arrayDataInvalidated: boolean
}
