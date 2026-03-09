
import type { StringAtlasExport } from "@boundary/atlas"
import type { BoundaryStore } from "../store"
import type { MatrixMode } from "./store.t.ts"

/**
 * Параметры инициализации runtime матрицы.
 *
 * Содержит данные, которые нужны выбранной среде для первого запуска:
 * - `bytecode` — скомпилированные правила переходов (VM-код)
 * - `bytecodeOffsets` — смещения bytecode для каждой браны
 * - `states` — начальные состояния бран
 * - `braneDescriptors` — дескрипторы бран [block_ptr, bytecode_offset, ...]
 * - `heap` — данные кучи (поля, строки, массивы)
 */
export interface MatrixInitParams {
  /** Bytecode правила переходов */
  bytecode: Uint32Array
  /** Смещения bytecode для каждой браны */
  bytecodeOffsets: Uint32Array
  /** Начальные состояния бран */
  states: Uint32Array
  /** Дескрипторы бран: [block_ptr0, bytecode_offset0, block_ptr1, bytecode_offset1, ...] */
  braneDescriptors: Uint32Array
  /** Данные кучи (поля, строки, массивы) */
  heap: Uint32Array
}

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
  step(store$?: BoundaryStore): void
  readChanges(): Promise<MatrixChanges>
  heapUpdate(updates: MatrixHeapUpdate[]): void
  clear(): void
  statesSnapshot(): Uint32Array | null
}

/**
 * Общий контекст инициализации runtime.
 */
export interface MatrixRuntimeInitContext {
  store$: BoundaryStore
  params: MatrixInitParams
  atlasExport: StringAtlasExport
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
  braneBlockPtrs: number[]
  heapAllocOffset: number
  arrayReserveSize: number
  arrayDataInvalidated: boolean
}
