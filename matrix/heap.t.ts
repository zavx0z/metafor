/**
 * Типы для модуля heap — построение кучи и поиск полей.
 * @packageDocumentation
 */

/**
 * Метаданные поля в упакованном формате (u32).
 *
 * Формат: [8 бит: тип] [8 бит: размер] [16 бит: смещение]
 * - [31:24] — тип поля (TYPE.FLOAT, TYPE.UINT, ...)
 * - [23:16] — размер в словах (1 для скаляров, 2 для указателей)
 * - [15:0] — смещение значения в блоке (в словах)
 */
export type PackedMeta = number

/**
 * Распакованные метаданные поля.
 */
export interface FieldMeta {
  /** Тип поля (TYPE.FLOAT, TYPE.UINT, ...) */
  type: number
  /** Размер в словах (1 или 2) */
  size: number
  /** Смещение значения в блоке (в словах) */
  offset: number
}

/**
 * Результат построения heap-блока браны.
 */
export interface HeapBlock {
  /** Смещение блока в heap (индекс u32) */
  blockPtr: number
  /** Размер блока в словах */
  blockSize: number
  /** Данные блока */
  data: Uint32Array
}

/**
 * Результат построения всего heap для ансамбля бран.
 */
export interface HeapLayout {
  /** Плоский heap для всех бран */
  heap: Uint32Array
  /** Смещения блоков для каждой браны: [blockPtr0, blockPtr1, ...] */
  blockPtrs: number[]
  /** Размеры блоков для каждой браны: [blockSize0, blockSize1, ...] */
  blockSizes: number[]
}

/**
 * Входные данные для построения heap.
 */
export interface HeapInput {
  /** Локальные поля для каждой браны: [[fieldIndex, encodedValue], ...][] */
  localFields: [number, number][][]
  /** Маппинг брана → ID entangled блоков: number[][] */
  braneEntangledMap: number[][]
  /** Поля для каждого entangled блока: ключ → [[fieldIndex, encodedValue], ...] */
  entangledFields: Map<string, [number, number][]>
  /** Типы полей: [fieldIndex, type][] */
  fieldTypes: Map<number, number>
  /** Метаданные полей: [fieldIndex, {fieldType, fieldSize}][] (опционально, вычисляется из fieldTypes) */
  fieldMeta?: Map<number, { fieldType: number; fieldSize: number }>
}
