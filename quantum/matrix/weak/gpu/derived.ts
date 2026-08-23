/**
 * `@matrix/weak/gpu/derived` выводит производные execution-формы из канонического Matrix store.
 *
 * Этот модуль превращает канонические данные в packed-представления для GPU
 * и не мутирует внешний store.
 */

import type { DerivedWeakData, GpuEncodedField, GpuFlattenedTransition } from "@matrix/types/gpu"
import type { MatrixConditionRecord } from "@matrix/types/condition"
import type { MatrixFieldValueRecord, MatrixStore } from "@matrix/types/store"
import type { MatrixFieldRecord } from "@matrix/types/data"
import { FIELD_TYPE, OP, VALUE_TYPE } from "../constants"
import { buildHeap } from "./layout-heap"
import { compileFlattenedEnsemble, compileFlattenedSuperposition } from "./bytecode"
import { createPackContext, encodeValue, fieldTypeToBytecodeType } from "./pack"
import { evaluateCondition } from "../cpu/transition"

/** Собирает метаданные полей для производного кодирования. */
function createFieldMetaMap(fields: MatrixFieldRecord[]): Map<number, { fieldType: number; fieldSize: number }> {
  const meta = new Map<number, { fieldType: number; fieldSize: number }>()
  fields.forEach((field, fieldIndex) => {
    const fieldType = fieldTypeToBytecodeType(field.type)
    meta.set(fieldIndex, { fieldType, fieldSize: 2 })
  })
  return meta
}

/**
 * Группирует условия перехода по индексу поля.
 *
 * WGSL не реализует синтаксис регулярных выражений JavaScript. Поэтому
 * `pattern` вычисляется эталонным исполнителем над текущим Store и записывается
 * в bytecode как `RESOLVED`. При изменении такого Field GPU runtime заменяет
 * bytecode соответствующей Brane до следующего шага.
 *
 * @see [Повторное вычисление pattern после изменения Field](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.conditions.test.ts)
 */
function groupTransitionConditions(
  store: MatrixStore,
  braneIndex: number,
  conditionOffset: number,
  conditionCount: number,
): GpuFlattenedTransition["conditions"] {
  const grouped = new Map<number, MatrixConditionRecord[]>()
  const conditionEnd = conditionOffset + conditionCount

  for (let conditionIndex = conditionOffset; conditionIndex < conditionEnd; conditionIndex++) {
    const condition = store.conditions[conditionIndex]
    if (!condition) {
      throw new Error(`Matrix condition ${conditionIndex} is missing from the canonical Store`)
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
      op: condition.op === OP.PATTERN ? OP.RESOLVED : condition.op,
      val: condition.op === OP.PATTERN
        ? evaluateCondition(store, braneIndex, condition)
        : condition.value,
    })),
  }))
}

/** Преобразует канонические переходы в уплощённую форму для компиляции bytecode. */
function flattenedBraneTransitions(
  store: MatrixStore,
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
          conditions: groupTransitionConditions(store, braneIndex, transition.conditionOffset, transition.conditionCount),
        })
      }

      return stateTransitions
    }),
  }
}

function toFlattenedTransitions(store: MatrixStore): Array<{ transitions: GpuFlattenedTransition[][] }> {
  return store.branes.map((_, braneIndex) => flattenedBraneTransitions(store, braneIndex))
}

/** Compiles only one structurally changed brane graph. */
export function deriveWeakBraneBytecode(store: MatrixStore, braneIndex: number): Uint32Array {
  return compileFlattenedSuperposition(
    flattenedBraneTransitions(store, braneIndex).transitions,
    store.fields,
    store.stringTable,
  ).bytecode
}

/** Возвращает true, если граф браны содержит регулярное выражение для Field. */
export function braneHasPatternCondition(
  store: MatrixStore,
  braneIndex: number,
  fieldIndex?: number,
): boolean {
  const brane = store.branes[braneIndex]
  if (!brane) return false

  for (let stateIndex = 0; stateIndex < brane.stateCount; stateIndex++) {
    const state = store.stateTable[brane.stateOffset + stateIndex]
    if (!state) continue
    for (
      let transitionIndex = state.transitionOffset;
      transitionIndex < state.transitionOffset + state.transitionCount;
      transitionIndex++
    ) {
      const transition = store.transitions[transitionIndex]
      if (!transition) continue
      for (
        let conditionIndex = transition.conditionOffset;
        conditionIndex < transition.conditionOffset + transition.conditionCount;
        conditionIndex++
      ) {
        const condition = store.conditions[conditionIndex]
        if (
          condition?.op === OP.PATTERN &&
          (fieldIndex === undefined || condition.fieldIndex === fieldIndex)
        ) return true
      }
    }
  }
  return false
}

/** Собирает значения полей shared-блоков из канонического store. */
function collectSharedBlockFields(store: MatrixStore): MatrixFieldValueRecord[][] {
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
function collectBraneLocalFields(store: MatrixStore): MatrixFieldValueRecord[][] {
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
function collectBraneSharedBlockRefs(store: MatrixStore): number[][] {
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
    if (Array.isArray(entry.value) && entry.value.length > 0) {
      words += 1 + entry.value.length
    }
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
): Map<string, GpuEncodedField[]> {
  const map = new Map<string, GpuEncodedField[]>()

  blocks.forEach((blockFields, blockIndex) => {
    const encodedFields = blockFields.map(({ fieldIndex, value }) => {
      const meta = fieldMetaMap.get(fieldIndex)
      if (!meta) {
        throw new Error(`Field ${fieldIndex} not defined in canonical store`)
      }
      const ctx = createPackContext(fields[fieldIndex]!, stringTable, allocateHeap, heap)
      const encoded = encodeValue(value, ctx)
      return [fieldIndex, encoded.value1, encoded.value2] as GpuEncodedField
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
): GpuEncodedField[][] {
  return braneFields.map((entries) =>
    entries.map(({ fieldIndex, value }) => {
      const meta = fieldMetaMap.get(fieldIndex)
      if (!meta) {
        throw new Error(`Field ${fieldIndex} not defined in canonical store`)
      }
      const ctx = createPackContext(fields[fieldIndex]!, stringTable, allocateHeap, heap)
      const encoded = encodeValue(value, ctx)
      return [fieldIndex, encoded.value1, encoded.value2] as GpuEncodedField
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
export function deriveWeakData(store: MatrixStore): DerivedWeakData {
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
