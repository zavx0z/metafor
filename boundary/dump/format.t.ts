/**
 * Типы бинарного формата для сериализации Matrix.
 *
 * @packageDocumentation
 */

/**
 * Магическое число файла: "MTXZ" = 0x4D54585A
 */
export const MAGIC_NUMBER = 0x4D54585A

/**
 * Версия бинарного формата.
 */
export const FORMAT_VERSION = 1

/**
 * Типы секций бинарного файла.
 */
export enum SectionType {
  HEAP = 1,
  BYTECODE = 2,
  BYTECODE_OFFSETS = 3,
  STATES = 4,
  STRING_REGISTRY = 5,
  STRING_HEAP = 6,
  FIELDS = 7,
  METADATA = 8,
}

/**
 * Заголовок файла (12 байт).
 */
export interface BinaryHeader {
  magic: number
  version: number
  sectionCount: number
}

/**
 * Дескриптор секции (12 байт).
 */
export interface SectionDescriptor {
  type: SectionType
  offset: number
  size: number
}

/**
 * Состояние Matrix для сериализации.
 */
export interface MatrixState {
  heap: Uint32Array
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
  states: Uint32Array
  stringRegistry: Uint32Array
  stringHeap: Uint32Array
  fields: unknown[]
  metadata: {
    arrayReserveSize: number
    heapAllocOffset: number
    braneBlockPtrs: number[]
  }
}

/**
 * Результат десериализации.
 */
export interface DeserializedState {
  heap: Uint32Array
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
  states: Uint32Array
  stringRegistry: Uint32Array
  stringHeap: Uint32Array
  fields: unknown[]
  metadata: {
    arrayReserveSize: number
    heapAllocOffset: number
    braneBlockPtrs: number[]
  }
}
