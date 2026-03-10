/**
 * Типы для Matrix-local heap builder.
 *
 * @packageDocumentation
 */

export type PackedMeta = number

export interface FieldMeta {
  type: number
  size: number
  offset: number
}

export interface HeapLayout {
  heap: Uint32Array
  blockPtrs: number[]
  sharedBlockPtrs: number[]
  blockSizes: number[]
}

export interface HeapInput {
  localFields: [number, number][][]
  braneEntangledMap: number[][]
  entangledFields: Map<string, [number, number][]>
  fieldMeta: Map<number, { fieldType: number; fieldSize: number }>
}
