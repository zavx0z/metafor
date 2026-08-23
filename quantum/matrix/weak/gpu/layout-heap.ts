/**
 * `@matrix/weak/gpu/layout-heap` собирает производный packed heap для Weak.
 *
 * Это execution-форма для GPU, а не каноническая truth-модель.
 */

import type { GpuEncodedField, GpuFieldMeta, GpuHeapInput, GpuHeapLayout } from "@matrix/types/gpu"

const META_TYPE_SHIFT = 24
const META_TYPE_MASK = 0xff
const META_SIZE_SHIFT = 16
const META_SIZE_MASK = 0xff
const META_OFFSET_MASK = 0xffff

export function packMeta(fieldType: number, fieldSize: number, fieldOffset: number): number {
  if (fieldType >= 256) throw new Error(`fieldType out of range: ${fieldType}`)
  if (fieldSize >= 256) throw new Error(`fieldSize out of range: ${fieldSize}`)
  if (fieldOffset >= 65536) throw new Error(`offset out of range: ${fieldOffset}`)
  return ((fieldType & META_TYPE_MASK) << META_TYPE_SHIFT) |
    ((fieldSize & META_SIZE_MASK) << META_SIZE_SHIFT) |
    (fieldOffset & META_OFFSET_MASK)
}

export function unpackMeta(packed: number): GpuFieldMeta {
  return {
    type: (packed >>> META_TYPE_SHIFT) & META_TYPE_MASK,
    size: (packed >>> META_SIZE_SHIFT) & META_SIZE_MASK,
    offset: packed & META_OFFSET_MASK,
  }
}

export function buildHeap(input: GpuHeapInput): GpuHeapLayout {
  const { localFields, braneEntangledMap, entangledFields, fieldMeta } = input

  const entangledKeys = Array.from(entangledFields.keys())
  const blockPtrs: number[] = []
  let currentPtr = 1

  for (let index = 0; index < entangledKeys.length; index++) {
    const fields = entangledFields.get(entangledKeys[index]!)!
    const size = calculateBlockSizeEncoded(fields, fieldMeta, 0)
    blockPtrs.push(currentPtr)
    currentPtr += size
  }

  const braneBlockPtrs: number[] = []
  const braneBlockSizes: number[] = []
  for (let index = 0; index < localFields.length; index++) {
    const fields = localFields[index]!
    const entangledCount = braneEntangledMap[index]!.length
    const size = calculateBlockSizeEncoded(fields, fieldMeta, entangledCount)
    braneBlockPtrs.push(currentPtr)
    braneBlockSizes.push(size)
    currentPtr += size
  }

  const heap = new Uint32Array(currentPtr)

  for (let index = 0; index < entangledKeys.length; index++) {
    const fields = entangledFields.get(entangledKeys[index]!)!
    writeBlock(heap, blockPtrs[index]!, fields, [], fieldMeta)
  }

  for (let index = 0; index < localFields.length; index++) {
    const fields = localFields[index]!
    const entangledIds = braneEntangledMap[index]!
    const entangledPtrs = entangledIds.map((id) => blockPtrs[id]!)
    writeBlock(heap, braneBlockPtrs[index]!, fields, entangledPtrs, fieldMeta)
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
  fields: GpuEncodedField[],
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
  fields: GpuEncodedField[],
  entangledPtrs: number[],
  fieldMeta: Map<number, { fieldType: number; fieldSize: number }>,
): void {
  heap[blockPtr] = fields.length
  heap[blockPtr + 1] = entangledPtrs.length
  heap[blockPtr + 2] = 0

  let headerIndex = blockPtr + 3
  let bodyOffset = blockPtr + 3 + fields.length * 2 + entangledPtrs.length

  for (const [fieldId, value, present] of fields) {
    const meta = fieldMeta.get(fieldId)
    if (!meta) {
      continue
    }

    heap[headerIndex++] = fieldId
    heap[headerIndex++] = packMeta(meta.fieldType, meta.fieldSize, bodyOffset - blockPtr)
    heap[bodyOffset++] = value
    if (meta.fieldSize > 1) {
      heap[bodyOffset++] = present
    }
  }

  for (const entangledPtr of entangledPtrs) {
    heap[headerIndex++] = entangledPtr
  }
}
