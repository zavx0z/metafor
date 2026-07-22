/**
 * `@matrix/weak/gpu/derived` выводит производные execution-формы из канонического Matrix store.
 *
 * Этот модуль превращает канонические данные в packed-представления для GPU
 * и не мутирует внешний store.
 */

import type { DerivedWeakData, GpuFlattenedTransition } from "@metafor/types/matrix/gpu"
import type { MatrixConditionRecord } from "@metafor/types/matrix/condition"
import type { MatrixData, MatrixFieldValueRecord } from "@metafor/types/matrix/store"
import type { MatrixFieldRecord } from "@metafor/types/matrix/data"
import { FIELD_TYPE, VALUE_TYPE } from "../constants"
import { buildHeap } from "./layout-heap"
import { compileFlattenedEnsemble, compileFlattenedSuperposition } from "./bytecode"
import { createPackContext, encodeValue, fieldTypeToBytecodeType } from "./pack"

/** Собирает метаданные полей для производного кодирования. */
function createFieldMetaMap(fields: MatrixFieldRecord[]): Map<number, { fieldType: number; fieldSize: number }> {
  const meta = new Map<number, { fieldType: number; fieldSize: number }>()
  fields.forEach((field, fieldIndex) => {
    const fieldType = fieldTypeToBytecodeType(field.type)
    const fieldSize = fieldType === VALUE_TYPE.STRING || fieldType === VALUE_TYPE.ARRAY ? 2 : 1
    meta.set(fieldIndex, { fieldType, fieldSize })
  })
  return meta
}

/** Группирует условия перехода по индексу поля. */
function groupTransitionConditions(
  store: MatrixData,
  conditionOffset: number,
  conditionCount: number,
): GpuFlattenedTransition["conditions"] {
  const grouped = new Map<number, MatrixConditionRecord[]>()
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

/** Преобразует канонические переходы в уплощённую форму для компиляции bytecode. */
function flattenedBraneTransitions(
  store: MatrixData,
  braneIndex: number,
): {transitions: GpuFlattenedTransition[][]} {
  const brane = store.branes[braneIndex]
  if (!brane) return {transitions: []}
  return {
    transitions: Array.from({ length: brane.stateCount }, (_, stateIndex) => {
      const state = store.stateTable[brane.stateOffset + stateIndex]
      if (!state) {
        return []
      }

      const transitionEnd = state.transitionOffset + state.transitionCount
      const stateTransitions: GpuFlattenedTransition[] = []
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
  }
}

function toFlattenedTransitions(store: MatrixData): Array<{ transitions: GpuFlattenedTransition[][] }> {
  return store.branes.map((_, braneIndex) => flattenedBraneTransitions(store, braneIndex))
}

/** Compiles only one structurally changed brane graph. */
export function deriveWeakBraneBytecode(store: MatrixData, braneIndex: number): Uint32Array {
  return compileFlattenedSuperposition(
    flattenedBraneTransitions(store, braneIndex).transitions,
    store.fields,
    store.stringTable,
  ).bytecode
}

/** Собирает значения полей shared-блоков из канонического store. */
function collectSharedBlockFields(store: MatrixData): MatrixFieldValueRecord[][] {
  return store.sharedBlocks.map((block) => {
    const fields: MatrixFieldValueRecord[] = []
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

/** Собирает локальные поля бран из канонического store. */
function collectBraneLocalFields(store: MatrixData): MatrixFieldValueRecord[][] {
  return store.branes.map((brane) => {
    const fields: MatrixFieldValueRecord[] = []
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

/** Собирает ссылки `brane -> shared block` из канонического store. */
function collectBraneSharedBlockRefs(store: MatrixData): number[][] {
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

/** Считает число слов heap, нужных для array-полей. */
function countArrayWords(fields: MatrixFieldRecord[], values: MatrixFieldValueRecord[]): number {
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

/** Кодирует shared-блоки в карту, понятную сборщику heap. */
function createBlockMap(
  blocks: MatrixFieldValueRecord[][],
  fields: MatrixFieldRecord[],
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
      const ctx = createPackContext(fields[fieldIndex]!, stringTable, allocateHeap, heap)
      return [fieldIndex, encodeValue(value, ctx).value1] as [number, number]
    })
    map.set(`shared-${blockIndex}`, encodedFields)
  })

  return map
}

/** Кодирует локальные поля бран в форму, понятную сборщику heap. */
function createLocalFields(
  braneFields: MatrixFieldValueRecord[][],
  fields: MatrixFieldRecord[],
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
      const ctx = createPackContext(fields[fieldIndex]!, stringTable, allocateHeap, heap)
      return [fieldIndex, encodeValue(value, ctx).value1] as [number, number]
    }),
  )
}

/**
 * Выводит packed-данные Weak из канонического Matrix store.
 *
 * Функция делает два прохода кодирования: сначала оценивает layout, затем
 * резервирует array payload и собирает итоговый heap и bytecode для GPU.
 *
 * @param store - Канонический store, из которого выводятся производные буферы.
 * @returns Производные данные, достаточные для GPU runtime.
 */
export function deriveWeakData(store: MatrixData): DerivedWeakData {
  const fieldMetaMap = createFieldMetaMap(store.fields)
  const sharedBlockFields = collectSharedBlockFields(store)
  const braneEntangledMap = collectBraneSharedBlockRefs(store)
  const braneLocalFields = collectBraneLocalFields(store)

  const initialSharedBlocks = createBlockMap(sharedBlockFields, store.fields, store.stringTable, fieldMetaMap)
  const initialLocalFields = createLocalFields(braneLocalFields, store.fields, store.stringTable, fieldMetaMap)
  const initialHeap = buildHeap({
    localFields: initialLocalFields,
    braneEntangledMap,
    entangledFields: initialSharedBlocks,
    fieldMeta: fieldMetaMap,
  })

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

  store.branes.forEach((brane, braneIndex) => {
    const blockPtr = finalHeap.blockPtrs[braneIndex]
    if (blockPtr !== undefined) {
      heap[blockPtr + 2] = brane.lock ? 1 : 0
    }
  })

  const compiled = compileFlattenedEnsemble(toFlattenedTransitions(store), store.fields, store.stringTable)

  return {
    heap,
    blockPtrs: finalHeap.blockPtrs,
    sharedBlockPtrs: finalHeap.sharedBlockPtrs,
    bytecode: compiled.bytecode,
    bytecodeOffsets: compiled.bytecodeOffsets,
    states: Uint32Array.from(store.states),
  }
}
