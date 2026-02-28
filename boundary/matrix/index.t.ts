/**
 * Типы для matrix — GPU runtime.
 *
 * @packageDocumentation
 */

import type { BackendInitParams } from "./backend.t"
import type { FieldType, Brane, Data, Collapse } from "@boundary/fields"

/**
 * Состояние модуля matrix.
 */
export interface MatrixState {
  /** Heap данные. Содержит блоки бран + резерв для ARRAY аллокаций. */
  heap: Uint32Array | null
  /** Смещения блоков бран в heap. */
  braneBlockPtrs: number[]
  /** Смещения bytecode для каждой браны. */
  bytecodeOffsets: Uint32Array | null
  /** Количество бран в текущей конфигурации. */
  braneCount: number
  /** Начальные состояния бран. */
  initialStates: Uint32Array | null
  /** Смещение для динамических аллокаций ARRAY в heap. */
  heapAllocOffset: number
  /** Размер резервированной зоны для ARRAY в heap. */
  arrayReserveSize: number
  /** Флаг: данные ARRAY невалидны после update(). */
  arrayDataInvalidated: boolean
}

/**
 * Параметры инициализации GPU.
 */
export type { BackendInitParams }

/**
 * Ре-экспорт типов из @boundary/fields.
 */
export type { FieldType, Brane, Data, Collapse }
