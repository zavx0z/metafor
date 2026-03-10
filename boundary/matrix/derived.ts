/**
 * @boundary/matrix/derived — derive packed execution forms from canonical Boundary store.
 *
 * Этот модуль трансформирует canonical stored data в packed execution forms
 * для GPU runtime. Все функции чистые и не мутируют внешнее состояние.
 *
 * @packageDocumentation
 */

import type {
  BoundaryConditionRecord,
  BoundaryData,
  BoundaryFieldRecord,
  BoundaryFieldValueRecord,
} from "../store.t"
import { VALUE_TYPE, FIELD_TYPE } from "./constants"
import { buildHeap } from "./heap"
import {
  createPackContext,
  encodeValue,
  fieldTypeToBytecodeType,
} from "./pack"
import { compileFlattenedEnsemble, type FlattenedTransition } from "./bytecode"

export interface DerivedMatrixData {
  heap: Uint32Array
  blockPtrs: number[]
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
  states: Uint32Array
}

/**
 * Создать meta map для field encoding.
 */
function createFieldMetaMap(fields: BoundaryFieldRecord[]): Map<number, { fieldType: number; fieldSize: number }> {
  const meta = new Map<number, { fieldType: number; fieldSize: number }>()
  fields.forEach((field, fieldIndex) => {
    const fieldType = fieldTypeToBytecodeType(field.type)
    const fieldSize = fieldType === VALUE_TYPE.STRING || fieldType === VALUE_TYPE.ARRAY ? 2 : 1
    meta.set(fieldIndex, { fieldType, fieldSize })
  })
  return meta
}

/**
 * Сгруппировать conditions по field index.
 */
function groupTransitionConditions(
  store: BoundaryData,
  conditionOffset: number,
  conditionCount: number,
): FlattenedTransition["conditions"] {
  const grouped = new Map<number, BoundaryConditionRecord[]>()
  const conditionEnd = conditionOffset + conditionCount

  for (let conditionIndex = conditionOffset; conditionIndex < conditionEnd; conditionIndex++) {
    const condition = store.conditions[conditionIndex]
    if (!condition) {
      continue
    }

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

/**
 * Конвертировать canonical transitions в flattened format для bytecode компиляции.
 */
function toFlattenedTransitions(store: BoundaryData): Array<{ transitions: FlattenedTransition[][] }> {
  return store.branes.map((brane) => ({
    transitions: Array.from({ length: brane.stateCount }, (_, stateIndex) => {
      const state = store.stateTable[brane.stateOffset + stateIndex]
      if (!state) {
        return []
      }

      const transitionEnd = state.transitionOffset + state.transitionCount
      const stateTransitions: FlattenedTransition[] = []
      for (let transitionIndex = state.transitionOffset; transitionIndex < transitionEnd; transitionIndex++) {
        const transition = store.transitions[transitionIndex]
        if (!transition) {
          continue
        }

        stateTransitions.push({
          targetState: transition.targetState,
          conditions: groupTransitionConditions(store, transition.conditionOffset, transition.conditionCount),
        })
      }

      return stateTransitions
    }),
  }))
}

/**
 * Собрать shared block fields из canonical store.
 */
function collectSharedBlockFields(store: BoundaryData): BoundaryFieldValueRecord[][] {
  return store.sharedBlocks.map((block) => {
    const fields: BoundaryFieldValueRecord[] = []
    const valueEnd = block.valueOffset + block.valueCount
    for (let valueIndex = block.valueOffset; valueIndex < valueEnd; valueIndex++) {
      const field = store.sharedValues[valueIndex]
      if (field) {
        fields.push(field)
      }
    }
    return fields
  })
}

/**
 * Собрать brane local fields из canonical store.
 */
function collectBraneLocalFields(store: BoundaryData): BoundaryFieldValueRecord[][] {
  return store.branes.map((brane) => {
    const fields: BoundaryFieldValueRecord[] = []
    const valueEnd = brane.localValueOffset + brane.localValueCount
    for (let valueIndex = brane.localValueOffset; valueIndex < valueEnd; valueIndex++) {
      const field = store.braneValues[valueIndex]
      if (field) {
        fields.push(field)
      }
    }
    return fields
  })
}

/**
 * Собрать brane shared block refs из canonical store.
 */
function collectBraneSharedBlockRefs(store: BoundaryData): number[][] {
  return store.branes.map((brane) => {
    const refs: number[] = []
    const refEnd = brane.sharedBlockRefOffset + brane.sharedBlockRefCount
    for (let refIndex = brane.sharedBlockRefOffset; refIndex < refEnd; refIndex++) {
      const blockId = store.braneSharedBlockRefs[refIndex]
      if (blockId !== undefined) {
        refs.push(blockId)
      }
    }
    return refs
  })
}

/**
 * Посчитать слова для array полей.
 */
function countArrayWords(fields: BoundaryFieldRecord[], values: BoundaryFieldValueRecord[]): number {
  let words = 0
  for (const entry of values) {
    const field = fields[entry.fieldIndex]
    if (field?.type !== FIELD_TYPE.ARRAY_PTR) {
      continue
    }
    const items = entry.value as Array<number | boolean>
    words += 1 + items.length
  }
  return words
}

/**
 * Создать block map для shared blocks.
 */
function createBlockMap(
  blocks: BoundaryFieldValueRecord[][],
  fields: BoundaryFieldRecord[],
  stringTable: string[],
  fieldMetaMap: Map<number, { fieldType: number; fieldSize: number }>,
  allocateHeap?: (size: number) => number,
  heap?: Uint32Array,
): Map<string, [number, number][]> {
  const map = new Map<string, [number, number][]>()

  blocks.forEach((blockFields, blockIndex) => {
    const encodedFields = blockFields.map(({ fieldIndex, value }) => {
      const meta = fieldMetaMap.get(fieldIndex)
      if (!meta) {
        throw new Error(`Field ${fieldIndex} not defined in canonical store`)
      }
      const ctx = createPackContext(
        fields[fieldIndex]!,
        stringTable,
        allocateHeap,
        heap,
      )
      return [fieldIndex, encodeValue(value, ctx).value1] as [number, number]
    })
    map.set(`shared-${blockIndex}`, encodedFields)
  })

  return map
}

/**
 * Создать local fields encoding.
 */
function createLocalFields(
  braneFields: BoundaryFieldValueRecord[][],
  fields: BoundaryFieldRecord[],
  stringTable: string[],
  fieldMetaMap: Map<number, { fieldType: number; fieldSize: number }>,
  allocateHeap?: (size: number) => number,
  heap?: Uint32Array,
): [number, number][][] {
  return braneFields.map((entries) =>
    entries.map(({ fieldIndex, value }) => {
      const meta = fieldMetaMap.get(fieldIndex)
      if (!meta) {
        throw new Error(`Field ${fieldIndex} not defined in canonical store`)
      }
      const ctx = createPackContext(
        fields[fieldIndex]!,
        stringTable,
        allocateHeap,
        heap,
      )
      return [fieldIndex, encodeValue(value, ctx).value1] as [number, number]
    }),
  )
}

/**
 * Derive packed matrix data from canonical Boundary store.
 *
 * Это чистая функция — не мутирует входные данные.
 *
 * ## Pipeline steps:
 *
 * 1. **Schema projection** — field definitions и meta map для encoding
 * 2. **Data collection** — сбор shared/local fields из canonical store
 * 3. **Field encoding (pass 1)** — initial encoding без array allocation
 * 4. **Heap building (pass 1)** — построение initial heap для расчёта sizes
 * 5. **Array allocation** — резервирование места для array полей
 * 6. **Field encoding (pass 2)** — final encoding с array pointers
 * 7. **Heap building (pass 2)** — финальное построение heap
 * 8. **Lock projection** — projection lock flags из canonical store
 * 9. **Bytecode compilation** — компиляция transitions в bytecode
 *
 * @param store - Canonical Boundary store
 * @returns DerivedMatrixData для GPU execution
 */
export function deriveMatrixData(store: BoundaryData): DerivedMatrixData {
  // ============================================================================
  // STEP 1: Schema projection
  // ============================================================================
  const fieldMetaMap = createFieldMetaMap(store.fields)

  // ============================================================================
  // STEP 2: Data collection from canonical store
  // ============================================================================
  const sharedBlockFields = collectSharedBlockFields(store)
  const braneEntangledMap = collectBraneSharedBlockRefs(store)
  const braneLocalFields = collectBraneLocalFields(store)

  // ============================================================================
  // STEP 3-4: Field encoding (pass 1) + Heap building (pass 1)
  // ============================================================================
  const initialSharedBlocks = createBlockMap(sharedBlockFields, store.fields, store.stringTable, fieldMetaMap)
  const initialLocalFields = createLocalFields(braneLocalFields, store.fields, store.stringTable, fieldMetaMap)
  const initialHeap = buildHeap({
    localFields: initialLocalFields,
    braneEntangledMap,
    entangledFields: initialSharedBlocks,
    fieldMeta: fieldMetaMap,
  })

  // ============================================================================
  // STEP 5: Array allocation — рассчитать размер для array полей
  // ============================================================================
  const arrayWords =
    sharedBlockFields.reduce((sum, block) => sum + countArrayWords(store.fields, block), 0) +
    braneLocalFields.reduce((sum, fields) => sum + countArrayWords(store.fields, fields), 0)

  const heap = new Uint32Array(initialHeap.heap.length + arrayWords)
  let heapAllocOffset = initialHeap.heap.length
  const allocateHeap = (size: number): number => {
    const ptr = heapAllocOffset
    heapAllocOffset += size
    return ptr
  }

  // ============================================================================
  // STEP 6-7: Field encoding (pass 2) + Heap building (pass 2)
  // ============================================================================
  const finalSharedBlocks = createBlockMap(
    sharedBlockFields,
    store.fields,
    store.stringTable,
    fieldMetaMap,
    allocateHeap,
    heap,
  )
  const finalLocalFields = createLocalFields(
    braneLocalFields,
    store.fields,
    store.stringTable,
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

  // ============================================================================
  // STEP 8: Lock projection — project lock flags из canonical store
  // ============================================================================
  store.branes.forEach((brane, braneIndex) => {
    const blockPtr = finalHeap.blockPtrs[braneIndex]
    if (blockPtr === undefined) {
      return
    }
    heap[blockPtr + 2] = brane.lock ? 1 : 0
  })

  // ============================================================================
  // STEP 9: Bytecode compilation — компиляция transitions
  // ============================================================================
  const compiled = compileFlattenedEnsemble(
    toFlattenedTransitions(store),
    store.fields,
    store.stringTable,
  )

  return {
    heap,
    blockPtrs: finalHeap.blockPtrs,
    bytecode: compiled.bytecode,
    bytecodeOffsets: compiled.bytecodeOffsets,
    states: Uint32Array.from(store.states),
  }
}
