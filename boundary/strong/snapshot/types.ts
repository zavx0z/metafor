/**
 * Типы и константы двоичного формата boundary-снимка.
 */

export const MAGIC_NUMBER = 0x4D54585A

export const FORMAT_VERSION = 1

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

export interface BinaryHeader {
  magic: number
  version: number
  sectionCount: number
}

export interface SectionDescriptor {
  type: SectionType
  offset: number
  size: number
}

/**
 * Снимок boundary-состояния, достаточный для переноса и восстановления слабого слоя.
 */
export interface BoundaryStateSnapshot {
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

export type DeserializedBoundaryState = BoundaryStateSnapshot
