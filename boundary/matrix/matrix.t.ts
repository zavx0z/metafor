import type { MatrixMode } from "./store.t.ts"
import type { StoredStringTable } from "../fields/stored.t"

/**
 * Параметры инициализации runtime матрицы.
 *
 * Содержит данные, которые нужны выбранной среде для первого запуска:
 * - `bytecode` — скомпилированные правила переходов (VM-код)
 * - `bytecodeOffsets` — смещения bytecode для каждой браны
 * - `states` — начальные состояния бран
 * - `blockPtrs` — указатели на блоки бран в heap
 * - `heap` — данные кучи (поля, строки, массивы)
 */
export interface MatrixInitParams {
  /** Bytecode правила переходов */
  bytecode: Uint32Array
  /** Смещения bytecode для каждой браны */
  bytecodeOffsets: Uint32Array
  /** Начальные состояния бран */
  states: Uint32Array
  /** Указатели на блоки бран в heap */
  blockPtrs: number[]
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
  step(): void
  readChanges(): Promise<MatrixChanges>
  heapUpdate(updates: MatrixHeapUpdate[]): void
  clear(): void
  statesSnapshot(): Uint32Array | null
}

/**
 * Общий контекст инициализации runtime.
 */
export interface MatrixRuntimeInitContext {
  params: MatrixInitParams
  stringTable: StoredStringTable
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
