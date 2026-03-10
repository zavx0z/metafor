/**
 * @boundary/matrix/heap — Matrix-local packed heap materialization.
 *
 * Это derived execution form для GPU. Он никогда не является canonical truth.
 *
 * @packageDocumentation
 */

import type { FieldMeta, HeapInput, HeapLayout, PackedMeta } from "./heap.t"

const META_TYPE_SHIFT = 24
const META_TYPE_MASK = 0xff
const META_SIZE_SHIFT = 16
const META_SIZE_MASK = 0xff
const META_OFFSET_MASK = 0xffff

export function packMeta(fieldType: number, fieldSize: number, fieldOffset: number): PackedMeta {
  if (fieldType >= 256) throw new Error(`fieldType out of range: ${fieldType}`)
  if (fieldSize >= 256) throw new Error(`fieldSize out of range: ${fieldSize}`)
  if (fieldOffset >= 65536) throw new Error(`offset out of range: ${fieldOffset}`)
  return ((fieldType & META_TYPE_MASK) << META_TYPE_SHIFT) |
         ((fieldSize & META_SIZE_MASK) << META_SIZE_SHIFT) |
         (fieldOffset & META_OFFSET_MASK)
}

export function unpackMeta(packed: PackedMeta): FieldMeta {
  return {
    type: (packed >>> META_TYPE_SHIFT) & META_TYPE_MASK,
    size: (packed >>> META_SIZE_SHIFT) & META_SIZE_MASK,
    offset: packed & META_OFFSET_MASK,
  }
}

export function buildHeap(input: HeapInput): HeapLayout {
  const { localFields, braneEntangledMap, entangledFields, fieldMeta } = input

  const entangledKeys = Array.from(entangledFields.keys())
  const blockPtrs: number[] = []
  let currentPtr = 1

  for (let i = 0; i < entangledKeys.length; i++) {
    const fields = entangledFields.get(entangledKeys[i]!)!
    const size = calculateBlockSizeEncoded(fields, fieldMeta, 0)
    blockPtrs.push(currentPtr)
    currentPtr += size
  }

  const braneBlockPtrs: number[] = []
  const braneBlockSizes: number[] = []
  for (let i = 0; i < localFields.length; i++) {
    const fields = localFields[i]!
    const entangledCount = braneEntangledMap[i]!.length
    const size = calculateBlockSizeEncoded(fields, fieldMeta, entangledCount)
    braneBlockPtrs.push(currentPtr)
    braneBlockSizes.push(size)
    currentPtr += size
  }

  const heap = new Uint32Array(currentPtr)

  for (let i = 0; i < entangledKeys.length; i++) {
    const fields = entangledFields.get(entangledKeys[i]!)!
    writeBlock(heap, blockPtrs[i]!, fields, [], fieldMeta)
  }

  for (let i = 0; i < localFields.length; i++) {
    const fields = localFields[i]!
    const entangledIds = braneEntangledMap[i]!
    const entangledPtrs = entangledIds.map((id) => blockPtrs[id]!)
    writeBlock(heap, braneBlockPtrs[i]!, fields, entangledPtrs, fieldMeta)
  }

  return {
    heap,
    blockPtrs: braneBlockPtrs,
    sharedBlockPtrs: blockPtrs,
    blockSizes: braneBlockSizes,
  }
}

export function findFieldValueOffset(heap: Uint32Array, blockPtr: number, fieldIndex: number): number | null {
  const localCount = heap[blockPtr] ?? 0
  let descriptorOffset = blockPtr + 3

  for (let index = 0; index < localCount; index++) {
    const currentFieldIndex = heap[descriptorOffset] ?? -1
    const packedMeta = heap[descriptorOffset + 1] ?? 0
    if (currentFieldIndex === fieldIndex) {
      return blockPtr + unpackMeta(packedMeta).offset
    }
    descriptorOffset += 2
  }

  return null
}

function calculateBlockSizeEncoded(
  fields: [number, number][],
  fieldMeta: Map<number, { fieldType: number; fieldSize: number }>,
  entangledCount: number,
): number {
  const localCount = fields.length
  const headerWords = 3
  const descriptorWords = localCount * 2
  const entangledPtrsWords = entangledCount

  let valueWords = 0
  fields.forEach(([fieldId]) => {
    const meta = fieldMeta.get(fieldId)
    if (meta) {
      valueWords += meta.fieldSize
    }
  })

  return headerWords + descriptorWords + entangledPtrsWords + valueWords
}

function writeBlock(
  heap: Uint32Array,
  blockPtr: number,
  fields: [number, number][],
  entangledPtrs: number[],
  fieldMeta: Map<number, { fieldType: number; fieldSize: number }>,
): void {
  const localCount = fields.length
  const entangledCount = entangledPtrs.length

  heap[blockPtr] = localCount
  heap[blockPtr + 1] = entangledCount
  heap[blockPtr + 2] = 0

  let headerIndex = blockPtr + 3
  const entangledPtrsOffset = blockPtr + 3 + localCount * 2
  let bodyOffset = entangledPtrsOffset + entangledCount

  for (const [fieldId, encodedValue] of fields) {
    const meta = fieldMeta.get(fieldId)
    if (!meta) continue

    heap[headerIndex++] = fieldId
    heap[headerIndex++] = packMeta(meta.fieldType, meta.fieldSize, bodyOffset - blockPtr)
    heap[bodyOffset] = encodedValue
    bodyOffset += meta.fieldSize
  }

  for (let i = 0; i < entangledCount; i++) {
    heap[entangledPtrsOffset + i] = entangledPtrs[i] ?? 0
  }
}
