import { materializeEntanglement } from "./entangled"
import { buildHeap } from "./heap"
import type { Field } from "./index.t"
import { FieldType } from "./index.t"
import { TYPE } from "./opcodes"
import type { FlattenedBoundaryInput, StoredBoundaryData, StoredFieldMeta } from "./stored.t"
import { compileFlattenedEnsemble } from "./superposition"
import { createStoredStringInterner } from "./string-table"
import { createFieldEncodingContext, encodeFieldValue, encodeValue, fieldTypeToBytecodeType } from "./values"

interface StoredFieldEncodingMeta {
  fieldType: number
  fieldSize: number
}

interface StoredFieldMetaResult {
  fieldMeta: StoredFieldMeta[]
  fieldMetaMap: Map<number, StoredFieldEncodingMeta>
}

function createStoredFieldMeta(fields: Field[]): StoredFieldMetaResult {
  const fieldMeta: StoredFieldMeta[] = []
  const fieldMetaMap = new Map<number, StoredFieldEncodingMeta>()

  fields.forEach((field, fieldIndex) => {
    const fieldType = fieldTypeToBytecodeType(field.type)
    const fieldSize = fieldType === TYPE.STRING || fieldType === TYPE.ARRAY ? 2 : 1
    fieldMeta.push({ fieldIndex, fieldType, fieldSize })
    fieldMetaMap.set(fieldIndex, { fieldType, fieldSize })
  })

  return { fieldMeta, fieldMetaMap }
}

export function assembleStoredBoundaryData(flattened: FlattenedBoundaryInput): StoredBoundaryData {
  const branes = flattened.branes
  const fieldDefs = flattened.fields
  const values = branes.map((brane) => brane.values)
  const braneMapping = materializeEntanglement(values, flattened.entanglement)
  const stringInterner = createStoredStringInterner()
  const { fieldMeta, fieldMetaMap } = createStoredFieldMeta(fieldDefs)

  const encodedEntangledFields = new Map<string, [number, number][]>()
  for (const [key, entangledFields] of braneMapping.entangledFields.entries()) {
    const encoded = entangledFields.map(([fieldIndex, value]) => {
      const meta = fieldMetaMap.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx = createFieldEncodingContext(meta.fieldType, field, stringInterner)
      const encodedValue = encodeFieldValue(value, ctx)
      return [fieldIndex, encodedValue] as [number, number]
    })
    encodedEntangledFields.set(key, encoded)
  }

  const encodedLocalFields = braneMapping.localFields.map((braneFields) =>
    braneFields.map(([fieldIndex, value]) => {
      const meta = fieldMetaMap.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx = createFieldEncodingContext(meta.fieldType, field, stringInterner)
      const encodedValue = encodeFieldValue(value, ctx)
      return [fieldIndex, encodedValue] as [number, number]
    }),
  )

  const minArrayReserve = 256
  let arrayReserveSize = minArrayReserve

  for (const brane of branes) {
    for (const [fieldIndex, value] of brane.values) {
      const field = fieldDefs[fieldIndex]
      if (field?.type === FieldType.ARRAY_PTR && Array.isArray(value)) {
        const arraySize = 1 + value.length
        if (arraySize > arrayReserveSize) {
          arrayReserveSize = arraySize
        }
      }
    }
  }

  arrayReserveSize *= 2

  const initialHeapLayout = buildHeap({
    localFields: encodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: encodedEntangledFields,
    fieldMeta: fieldMetaMap,
  })

  let heap = initialHeapLayout.heap
  const extendedHeap = new Uint32Array(heap.length + arrayReserveSize)
  extendedHeap.set(heap)
  heap = extendedHeap

  let heapAllocOffset = heap.length - arrayReserveSize
  const allocateHeap = (size: number): number => {
    const ptr = heapAllocOffset
    heapAllocOffset += size
    return ptr
  }

  const finalEncodedLocalFields = braneMapping.localFields.map((braneFields) =>
    braneFields.map(([fieldIndex, value]) => {
      const meta = fieldMetaMap.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx = createFieldEncodingContext(meta.fieldType, field, stringInterner, allocateHeap, heap)
      const encodedValue = encodeValue(value, ctx)
      return [fieldIndex, encodedValue.value1] as [number, number]
    }),
  )

  const localHeapLayout = buildHeap({
    localFields: finalEncodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: encodedEntangledFields,
    fieldMeta: fieldMetaMap,
  })
  heap.set(localHeapLayout.heap)

  const finalEncodedEntangledFields = new Map<string, [number, number][]>()
  for (const [key, entangledFields] of braneMapping.entangledFields.entries()) {
    const encoded = entangledFields.map(([fieldIndex, value]) => {
      const meta = fieldMetaMap.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx = createFieldEncodingContext(meta.fieldType, field, stringInterner, allocateHeap, heap)
      const encodedValue = encodeValue(value, ctx)
      return [fieldIndex, encodedValue.value1] as [number, number]
    })
    finalEncodedEntangledFields.set(key, encoded)
  }

  const finalHeapLayout = buildHeap({
    localFields: finalEncodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: finalEncodedEntangledFields,
    fieldMeta: fieldMetaMap,
  })
  heap.set(finalHeapLayout.heap)

  const compiledRules = compileFlattenedEnsemble(branes, fieldDefs, stringInterner)

  return {
    fieldMeta,
    localFields: finalEncodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: Array.from(finalEncodedEntangledFields.entries()).map(([key, fields]) => ({ key, fields })),
    heap,
    blockPtrs: finalHeapLayout.blockPtrs,
    blockSizes: finalHeapLayout.blockSizes,
    bytecode: compiledRules.bytecode,
    bytecodeOffsets: compiledRules.bytecodeOffsets,
    states: new Uint32Array(branes.map((brane) => brane.state)),
    stringTable: stringInterner.table,
    arrayReserveSize,
  }
}
