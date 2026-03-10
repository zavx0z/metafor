import {
  buildHeap,
  compileFlattenedEnsemble,
  createFieldEncodingContext,
  createStoredStringInterner,
  encodeValue,
  fieldTypeToBytecodeType,
  FieldType,
  TYPE,
  type Field,
  type FlattenedTransition,
} from "../fields"
import type {
  BoundaryConditionRecord,
  BoundaryData,
  BoundaryFieldRecord,
  BoundaryFieldValueRecord,
  BoundaryValue,
} from "../store.t"

export interface DerivedMatrixData {
  heap: Uint32Array
  blockPtrs: number[]
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
  states: Uint32Array
}

function toFieldDefinitions(fields: BoundaryFieldRecord[]): Field[] {
  return fields.map((field) => ({
    type: field.type,
    ...(field.elementType !== undefined ? { elementType: field.elementType } : {}),
  }))
}

function createFieldMetaMap(fields: BoundaryFieldRecord[]): Map<number, { fieldType: number; fieldSize: number }> {
  const meta = new Map<number, { fieldType: number; fieldSize: number }>()
  fields.forEach((field, fieldIndex) => {
    const fieldType = fieldTypeToBytecodeType(field.type)
    const fieldSize = fieldType === TYPE.STRING || fieldType === TYPE.ARRAY ? 2 : 1
    meta.set(fieldIndex, { fieldType, fieldSize })
  })
  return meta
}

function groupConditions(conditions: BoundaryConditionRecord[]): FlattenedTransition["conditions"] {
  const grouped = new Map<number, BoundaryConditionRecord[]>()
  for (const condition of conditions) {
    const list = grouped.get(condition.fieldIndex)
    if (list) {
      list.push(condition)
    } else {
      grouped.set(condition.fieldIndex, [condition])
    }
  }

  return Array.from(grouped.entries()).map(([fieldIndex, fieldConditions]) => ({
    fieldIndex,
    checks: fieldConditions.map((condition) => ({
      op: condition.op,
      val: condition.value,
    })),
  }))
}

function toFlattenedTransitions(store: BoundaryData): Array<{ transitions: FlattenedTransition[][] }> {
  return store.branes.map((brane) => ({
    transitions: brane.transitions.map((stateTransitions) =>
      stateTransitions.map((transition) => ({
        targetState: transition.targetState,
        conditions: groupConditions(transition.conditions),
      })),
    ),
  }))
}

function countArrayWords(fields: BoundaryFieldRecord[], values: BoundaryFieldValueRecord[]): number {
  let words = 0
  for (const entry of values) {
    const field = fields[entry.fieldIndex]
    if (field?.type !== FieldType.ARRAY_PTR) {
      continue
    }
    const items = entry.value as Array<number | boolean>
    words += 1 + items.length
  }
  return words
}

function createBlockMap(
  blocks: BoundaryFieldValueRecord[][],
  fields: BoundaryFieldRecord[],
  stringTable: string[],
  fieldDefs: Field[],
  fieldMetaMap: Map<number, { fieldType: number; fieldSize: number }>,
  allocateHeap?: (size: number) => number,
  heap?: Uint32Array,
): Map<string, [number, number][]> {
  const stringInterner = createStoredStringInterner(stringTable)
  const map = new Map<string, [number, number][]>()

  blocks.forEach((blockFields, blockIndex) => {
    const encodedFields = blockFields.map(({ fieldIndex, value }) => {
      const meta = fieldMetaMap.get(fieldIndex)
      if (!meta) {
        throw new Error(`Field ${fieldIndex} not defined in canonical store`)
      }
      const ctx = createFieldEncodingContext(meta.fieldType, fieldDefs[fieldIndex], stringInterner, allocateHeap, heap)
      return [fieldIndex, encodeValue(value, ctx).value1] as [number, number]
    })
    map.set(`shared-${blockIndex}`, encodedFields)
  })

  return map
}

function createLocalFields(
  branes: BoundaryData["branes"],
  fields: BoundaryFieldRecord[],
  stringTable: string[],
  fieldDefs: Field[],
  fieldMetaMap: Map<number, { fieldType: number; fieldSize: number }>,
  allocateHeap?: (size: number) => number,
  heap?: Uint32Array,
): [number, number][][] {
  const stringInterner = createStoredStringInterner(stringTable)

  return branes.map((brane) =>
    brane.localFields.map(({ fieldIndex, value }) => {
      const meta = fieldMetaMap.get(fieldIndex)
      if (!meta) {
        throw new Error(`Field ${fieldIndex} not defined in canonical store`)
      }
      const ctx = createFieldEncodingContext(meta.fieldType, fieldDefs[fieldIndex], stringInterner, allocateHeap, heap)
      return [fieldIndex, encodeValue(value, ctx).value1] as [number, number]
    }),
  )
}

export function deriveMatrixData(store: BoundaryData): DerivedMatrixData {
  const fieldDefs = toFieldDefinitions(store.fields)
  const fieldMetaMap = createFieldMetaMap(store.fields)
  const sharedBlockFields = store.sharedBlocks.map((block) => block.fields)
  const braneEntangledMap = store.branes.map((brane) => brane.sharedBlockIds)

  const initialSharedBlocks = createBlockMap(sharedBlockFields, store.fields, store.stringTable, fieldDefs, fieldMetaMap)
  const initialLocalFields = createLocalFields(store.branes, store.fields, store.stringTable, fieldDefs, fieldMetaMap)
  const initialHeap = buildHeap({
    localFields: initialLocalFields,
    braneEntangledMap,
    entangledFields: initialSharedBlocks,
    fieldMeta: fieldMetaMap,
  })

  const arrayWords =
    store.sharedBlocks.reduce((sum, block) => sum + countArrayWords(store.fields, block.fields), 0) +
    store.branes.reduce((sum, brane) => sum + countArrayWords(store.fields, brane.localFields), 0)

  const heap = new Uint32Array(initialHeap.heap.length + arrayWords)
  let heapAllocOffset = initialHeap.heap.length
  const allocateHeap = (size: number): number => {
    const ptr = heapAllocOffset
    heapAllocOffset += size
    return ptr
  }

  const finalSharedBlocks = createBlockMap(
    sharedBlockFields,
    store.fields,
    store.stringTable,
    fieldDefs,
    fieldMetaMap,
    allocateHeap,
    heap,
  )
  const finalLocalFields = createLocalFields(
    store.branes,
    store.fields,
    store.stringTable,
    fieldDefs,
    fieldMetaMap,
    allocateHeap,
    heap,
  )
  const finalHeap = buildHeap({
    localFields: finalLocalFields,
    braneEntangledMap,
    entangledFields: finalSharedBlocks,
    fieldMeta: fieldMetaMap,
  })
  heap.set(finalHeap.heap)

  // Canonical lock lives in Boundary store; GPU-only heap mirror must preserve it.
  store.branes.forEach((brane, braneIndex) => {
    const blockPtr = finalHeap.blockPtrs[braneIndex]
    if (blockPtr === undefined) {
      return
    }
    heap[blockPtr + 2] = brane.lock ? 1 : 0
  })

  const compiled = compileFlattenedEnsemble(
    toFlattenedTransitions(store),
    fieldDefs,
    createStoredStringInterner(store.stringTable),
  )

  return {
    heap,
    blockPtrs: finalHeap.blockPtrs,
    bytecode: compiled.bytecode,
    bytecodeOffsets: compiled.bytecodeOffsets,
    states: Uint32Array.from(store.states),
  }
}
