/**
 * Частичное обновление производной Matrix-проекции.
 *
 * Неизменённые Branes, графы и общие блоки сохраняют адреса. Действующий
 * Process сохраняется только когда идентичности Atom, State и Process
 * совместимы с изменением; иначе результат явно перечисляет затронутые Atom
 * для выдачи нового номера выполнения.
 *
 * @see [Изменение Process аннулирует только затронутые выполнения](https://github.com/zavx0z/metafor/blob/main/matrix/incremental.spec.ts#L492-L606)
 * @see [CPU и WebGPU сохраняют одну структурную трассу](https://github.com/zavx0z/metafor/blob/main/matrix/incremental.spec.ts#L608-L642)
 *
 * @packageDocumentation
 */

import type {MatrixConditionRecord} from "@metafor/types/matrix/condition"
import type {MatrixFieldRecord} from "@metafor/types/matrix/data"
import {STATE_NONE} from "@metafor/types/matrix/runtime"
import type {MatrixBraneRecord, MatrixData, MatrixStateRecord, MatrixTransitionRecord, MatrixValue} from "@metafor/types/matrix/store"
import type {WeakStructuralUpdate} from "@metafor/types/matrix/weak"
import {FieldType, flattenMatrixData} from "@matrix/gravity"
import {gravity$} from "@matrix/gravity/store.ts"
import {assembleStoredMatrixData, createStoredStringInterner, normalizeFieldValue, strong$} from "@matrix/strong"
import {OP} from "@matrix/weak/constants.ts"
import {weak$} from "@matrix/weak"
import {buildMatrixRuntime} from "./birth.ts"
import {matrix$} from "./store.ts"
import {
  type MatrixProjectionChange,
  readMatrixProjectionFragment,
} from "./projection.ts"

type Graph = {
  states: MatrixStateRecord[]
  transitions: MatrixTransitionRecord[]
  conditions: MatrixConditionRecord[]
}

export type IncrementalMatrixStats = {
  projectionAtoms: number
  touchedBranes: number
  reusedBranes: number
  appendedBranes: number
  reusedGraphs: number
  appendedGraphs: number
  reusedSharedBlocks: number
  appendedSharedBlocks: number
}

export type IncrementalMatrixResult = {
  weakUpdate: WeakStructuralUpdate
  invalidatedAtomIds: number[]
  preservedProcessStates: Array<{atomId: number; braneIndex: number; stateIndex: number}>
  processCandidateBraneIndexes: number[]
  stats: IncrementalMatrixStats
}

const atomFieldKey = (atomId: number, fieldId: number): string => `${atomId}\0${fieldId}`
const clone = <T>(value: T): T => structuredClone(value)

let incrementalIndexesInitialized = false
let nextSyntheticWimpFieldId = 1
const syntheticWimpFieldIdByAtomField = new Map<string, number>()
const atomFieldKeysByAtomId = new Map<number, Set<string>>()
const activeAtomIndexById = new Map<number, number>()
const atomIndexByWimpSrc = new Map<string, Map<number, number>>()
const freeBraneIndexes: number[] = []
const fieldRefCounts: number[] = []
const freeFieldIndexes: number[] = []
const braneValueCapacities: number[] = []
const braneSharedRefCapacities: number[] = []
const graphSignaturesByBraneIndex: string[] = []
const graphStateOffsetsByBraneIndex: number[] = []
const graphStateCapacitiesByBraneIndex: number[] = []
const graphTransitionOffsetsByBraneIndex: number[] = []
const graphTransitionCapacitiesByBraneIndex: number[] = []
const graphConditionOffsetsByBraneIndex: number[] = []
const graphConditionCapacitiesByBraneIndex: number[] = []
const graphStateRangeRefCounts = new Map<string, number>()
const graphTransitionRangeRefCounts = new Map<string, number>()
const graphConditionRangeRefCounts = new Map<string, number>()
const sharedBlockRefCounts: number[] = []
const freeSharedBlockIndexes: number[] = []
const sharedValueOffsetsByBlockIndex: number[] = []
const sharedValueCapacitiesByBlockIndex: number[] = []
const freeSyntheticWimpFieldIds: number[] = []
const freeIndexMembership = new Map<number[], Set<number>>()

const nextPackedCapacity = (required: number): number => {
  if (required <= 0) return 0
  let capacity = 1
  while (capacity < required) capacity *= 2
  return capacity
}

const packedRangeKey = (offset: number, capacity: number): string => `${offset}\0${capacity}`

const addPackedRangeRef = (refs: Map<string, number>, offset: number, capacity: number): void => {
  if (capacity <= 0) return
  const key = packedRangeKey(offset, capacity)
  refs.set(key, (refs.get(key) ?? 0) + 1)
}

const removePackedRangeRef = (refs: Map<string, number>, offset: number, capacity: number): void => {
  if (capacity <= 0) return
  const key = packedRangeKey(offset, capacity)
  const count = (refs.get(key) ?? 0) - 1
  if (count > 0) refs.set(key, count)
  else refs.delete(key)
}

const addFreeIndex = (indexes: number[], index: number): void => {
  let membership = freeIndexMembership.get(indexes)
  if (!membership) {
    membership = new Set()
    freeIndexMembership.set(indexes, membership)
  }
  if (membership.has(index)) return
  membership.add(index)
  indexes.push(index)
}

const takeFreeIndex = (indexes: number[]): number | undefined => {
  const membership = freeIndexMembership.get(indexes)
  while (indexes.length > 0) {
    const index = indexes.pop()!
    if (!membership || membership.delete(index)) return index
  }
  return undefined
}

const claimFreeIndex = (indexes: number[], index: number): void => {
  freeIndexMembership.get(indexes)?.delete(index)
}

const resetFreeIndexes = (indexes: number[]): void => {
  indexes.length = 0
  freeIndexMembership.get(indexes)?.clear()
}

const addAtomFieldKey = (atomId: number, key: string): void => {
  const keys = atomFieldKeysByAtomId.get(atomId)
  if (keys) keys.add(key)
  else atomFieldKeysByAtomId.set(atomId, new Set([key]))
}

const installLegacyFieldAddress = (
  atomId: number,
  fieldId: number,
  braneIndex: number,
  runtimeFieldIndex: number,
): void => {
  const key = atomFieldKey(atomId, fieldId)
  let syntheticId = syntheticWimpFieldIdByAtomField.get(key)
  if (syntheticId === undefined) {
    syntheticId = takeFreeIndex(freeSyntheticWimpFieldIds) ?? nextSyntheticWimpFieldId++
    syntheticWimpFieldIdByAtomField.set(key, syntheticId)
  }
  strong$.runtimeFieldIndexByWimpFieldId.set(syntheticId, runtimeFieldIndex)
  strong$.braneIndexByWimpFieldId.set(syntheticId, braneIndex)
  const ids = strong$.wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex]
  if (ids) ids.push(syntheticId)
  else strong$.wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] = [syntheticId]
  if (strong$.topologyAtomFieldIds.has(key)) strong$.topologyWimpFieldIds.add(syntheticId)
}

/**
 * Строит служебные индексы частичных изменений после холодного рождения.
 *
 * Рабочая Matrix вызывает эту функцию один раз до открытия Force. Проверки
 * могут вызвать её для следующей изолированной фикстуры в том же процессе.
 */
export const initializeIncrementalMatrixIndexes = (): void => {
  incrementalIndexesInitialized = false
  nextSyntheticWimpFieldId = 1
  syntheticWimpFieldIdByAtomField.clear()
  atomFieldKeysByAtomId.clear()
  activeAtomIndexById.clear()
  atomIndexByWimpSrc.clear()
  resetFreeIndexes(freeBraneIndexes)
  fieldRefCounts.length = 0
  resetFreeIndexes(freeFieldIndexes)
  braneValueCapacities.length = 0
  braneSharedRefCapacities.length = 0
  graphSignaturesByBraneIndex.length = 0
  graphStateOffsetsByBraneIndex.length = 0
  graphStateCapacitiesByBraneIndex.length = 0
  graphTransitionOffsetsByBraneIndex.length = 0
  graphTransitionCapacitiesByBraneIndex.length = 0
  graphConditionOffsetsByBraneIndex.length = 0
  graphConditionCapacitiesByBraneIndex.length = 0
  graphStateRangeRefCounts.clear()
  graphTransitionRangeRefCounts.clear()
  graphConditionRangeRefCounts.clear()
  sharedBlockRefCounts.length = 0
  resetFreeIndexes(freeSharedBlockIndexes)
  sharedValueOffsetsByBlockIndex.length = 0
  sharedValueCapacitiesByBlockIndex.length = 0
  resetFreeIndexes(freeSyntheticWimpFieldIds)
  strong$.runtimeFieldIndexByWimpFieldId.clear()
  strong$.wimpFieldIdsByRuntimeFieldIndex = []
  strong$.braneIndexByWimpFieldId.clear()
  strong$.topologyWimpFieldIds.clear()

  gravity$.activeAtomIds.forEach((atomId, index) => activeAtomIndexById.set(atomId, index))
  for (const [src, atomIds] of gravity$.atomIdsByWimpSrc) {
    atomIndexByWimpSrc.set(src, new Map(atomIds.map((atomId, index) => [atomId, index])))
  }

  for (const [key, runtimeFieldIndex] of strong$.runtimeFieldIndexByAtomFieldId) {
    const [rawAtomId, rawFieldId] = key.split("\0")
    const atomId = Number(rawAtomId)
    const fieldId = Number(rawFieldId)
    const braneIndex = gravity$.getBraneIndexByAtomId(atomId)
    if (braneIndex === undefined) continue
    addAtomFieldKey(atomId, key)
    fieldRefCounts[runtimeFieldIndex] = (fieldRefCounts[runtimeFieldIndex] ?? 0) + 1
    installLegacyFieldAddress(atomId, fieldId, braneIndex, runtimeFieldIndex)
  }
  for (let fieldIndex = 0; fieldIndex < matrix$.fields.length; fieldIndex++) {
    if ((fieldRefCounts[fieldIndex] ?? 0) === 0) addFreeIndex(freeFieldIndexes, fieldIndex)
  }
  for (let braneIndex = 0; braneIndex < matrix$.branes.length; braneIndex++) {
    if (gravity$.getAtomId(braneIndex) === undefined) addFreeIndex(freeBraneIndexes, braneIndex)
    const brane = matrix$.branes[braneIndex]
    if (!brane) continue
    braneValueCapacities[braneIndex] = brane.localValueCount
    braneSharedRefCapacities[braneIndex] = brane.sharedBlockRefCount
    const graph = extractGraph(braneIndex)
    graphSignaturesByBraneIndex[braneIndex] = graphSignature(graph)
    graphStateOffsetsByBraneIndex[braneIndex] = brane.stateOffset
    graphStateCapacitiesByBraneIndex[braneIndex] = brane.stateCount
    addPackedRangeRef(graphStateRangeRefCounts, brane.stateOffset, brane.stateCount)
    const firstState = matrix$.stateTable[brane.stateOffset]
    graphTransitionOffsetsByBraneIndex[braneIndex] = firstState?.transitionOffset ?? 0
    graphTransitionCapacitiesByBraneIndex[braneIndex] = graph.transitions.length
    addPackedRangeRef(
      graphTransitionRangeRefCounts,
      graphTransitionOffsetsByBraneIndex[braneIndex]!,
      graph.transitions.length,
    )
    const firstTransition = firstState === undefined
      ? undefined
      : matrix$.transitions[firstState.transitionOffset]
    graphConditionOffsetsByBraneIndex[braneIndex] = firstTransition?.conditionOffset ?? 0
    graphConditionCapacitiesByBraneIndex[braneIndex] = graph.conditions.length
    addPackedRangeRef(
      graphConditionRangeRefCounts,
      graphConditionOffsetsByBraneIndex[braneIndex]!,
      graph.conditions.length,
    )
    for (let refIndex = brane.sharedBlockRefOffset; refIndex < brane.sharedBlockRefOffset + brane.sharedBlockRefCount; refIndex++) {
      const blockIndex = matrix$.braneSharedBlockRefs[refIndex]
      if (blockIndex !== undefined) sharedBlockRefCounts[blockIndex] = (sharedBlockRefCounts[blockIndex] ?? 0) + 1
    }
  }
  for (let blockIndex = 0; blockIndex < matrix$.sharedBlocks.length; blockIndex++) {
    const block = matrix$.sharedBlocks[blockIndex]
    if (block) {
      sharedValueOffsetsByBlockIndex[blockIndex] = block.valueOffset
      sharedValueCapacitiesByBlockIndex[blockIndex] = block.valueCount
    }
    if ((sharedBlockRefCounts[blockIndex] ?? 0) === 0) addFreeIndex(freeSharedBlockIndexes, blockIndex)
  }
  incrementalIndexesInitialized = true
}

const clearAtomFieldMappings = (atomId: number): void => {
  for (const key of atomFieldKeysByAtomId.get(atomId) ?? []) {
    const runtimeFieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(key)
    strong$.runtimeFieldIndexByAtomFieldId.delete(key)
    strong$.topologyAtomFieldIds.delete(key)
    if (runtimeFieldIndex !== undefined) {
      fieldRefCounts[runtimeFieldIndex] = Math.max(0, (fieldRefCounts[runtimeFieldIndex] ?? 0) - 1)
      if (fieldRefCounts[runtimeFieldIndex] === 0) addFreeIndex(freeFieldIndexes, runtimeFieldIndex)
    }
    const syntheticId = syntheticWimpFieldIdByAtomField.get(key)
    if (syntheticId !== undefined) {
      syntheticWimpFieldIdByAtomField.delete(key)
      addFreeIndex(freeSyntheticWimpFieldIds, syntheticId)
      strong$.runtimeFieldIndexByWimpFieldId.delete(syntheticId)
      strong$.braneIndexByWimpFieldId.delete(syntheticId)
      strong$.topologyWimpFieldIds.delete(syntheticId)
    }
  }
  atomFieldKeysByAtomId.delete(atomId)
}

const detachAffectedFieldMemberships = (atomIds: Set<number>): void => {
  const runtimeFieldIndexes = new Set<number>()
  const syntheticIdsByRuntimeFieldIndex = new Map<number, Set<number>>()
  for (const atomId of atomIds) {
    for (const key of atomFieldKeysByAtomId.get(atomId) ?? []) {
      const runtimeFieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(key)
      if (runtimeFieldIndex !== undefined) runtimeFieldIndexes.add(runtimeFieldIndex)
      const syntheticId = syntheticWimpFieldIdByAtomField.get(key)
      if (syntheticId === undefined) continue
      const syntheticRuntimeFieldIndex = strong$.runtimeFieldIndexByWimpFieldId.get(syntheticId)
      if (syntheticRuntimeFieldIndex === undefined) continue
      const ids = syntheticIdsByRuntimeFieldIndex.get(syntheticRuntimeFieldIndex)
      if (ids) ids.add(syntheticId)
      else syntheticIdsByRuntimeFieldIndex.set(syntheticRuntimeFieldIndex, new Set([syntheticId]))
    }
  }
  for (const runtimeFieldIndex of runtimeFieldIndexes) {
    strong$.atomFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] =
      (strong$.atomFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] ?? [])
        .filter(([atomId]) => !atomIds.has(atomId))
  }
  for (const [runtimeFieldIndex, syntheticIds] of syntheticIdsByRuntimeFieldIndex) {
    strong$.wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] =
      (strong$.wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] ?? [])
        .filter((id) => !syntheticIds.has(id))
  }
}

const addAtomFieldMapping = (
  atomId: number,
  fieldId: number,
  braneIndex: number,
  runtimeFieldIndex: number,
  topology: boolean,
): void => {
  const key = atomFieldKey(atomId, fieldId)
  strong$.runtimeFieldIndexByAtomFieldId.set(key, runtimeFieldIndex)
  claimFreeIndex(freeFieldIndexes, runtimeFieldIndex)
  fieldRefCounts[runtimeFieldIndex] = (fieldRefCounts[runtimeFieldIndex] ?? 0) + 1
  const members = strong$.atomFieldIdsByRuntimeFieldIndex[runtimeFieldIndex]
  if (members) members.push([atomId, fieldId])
  else strong$.atomFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] = [[atomId, fieldId]]
  if (topology) strong$.topologyAtomFieldIds.add(key)
  addAtomFieldKey(atomId, key)
  installLegacyFieldAddress(atomId, fieldId, braneIndex, runtimeFieldIndex)
}

const removeGravityAtom = (atomId: number): number | undefined => {
  const braneIndex = gravity$.getBraneIndexByAtomId(atomId)
  const wimp = gravity$.getWimpSrcByAtomId(atomId)
  gravity$.atomIdToBraneIndex.delete(atomId)
  gravity$.wimpSrcByAtomId.delete(atomId)
  const activeIndex = activeAtomIndexById.get(atomId)
  if (activeIndex !== undefined) {
    const last = gravity$.activeAtomIds.pop()
    if (last !== undefined && last !== atomId) {
      gravity$.activeAtomIds[activeIndex] = last
      activeAtomIndexById.set(last, activeIndex)
    }
    activeAtomIndexById.delete(atomId)
  }
  if (wimp) {
    const atoms = gravity$.atomIdsByWimpSrc.get(wimp) ?? []
    const indexes = atomIndexByWimpSrc.get(wimp)
    const index = indexes?.get(atomId)
    if (index !== undefined) {
      const last = atoms.pop()
      if (last !== undefined && last !== atomId) {
        atoms[index] = last
        indexes?.set(last, index)
      }
      indexes?.delete(atomId)
    }
    if (atoms.length === 0) {
      gravity$.atomIdsByWimpSrc.delete(wimp)
      atomIndexByWimpSrc.delete(wimp)
    }
  }
  if (braneIndex !== undefined) {
    delete gravity$.braneIndexToAtomId[braneIndex]
    addFreeIndex(freeBraneIndexes, braneIndex)
  }
  return braneIndex
}

const indexGravityAtom = (atomId: number, braneIndex: number, wimp: string): void => {
  const previousWimp = gravity$.getWimpSrcByAtomId(atomId)
  if (previousWimp && previousWimp !== wimp) {
    const previous = gravity$.atomIdsByWimpSrc.get(previousWimp) ?? []
    const indexes = atomIndexByWimpSrc.get(previousWimp)
    const index = indexes?.get(atomId)
    if (index !== undefined) {
      const last = previous.pop()
      if (last !== undefined && last !== atomId) {
        previous[index] = last
        indexes?.set(last, index)
      }
      indexes?.delete(atomId)
    }
    if (previous.length === 0) {
      gravity$.atomIdsByWimpSrc.delete(previousWimp)
      atomIndexByWimpSrc.delete(previousWimp)
    }
  }
  gravity$.atomIdToBraneIndex.set(atomId, braneIndex)
  gravity$.braneIndexToAtomId[braneIndex] = atomId
  gravity$.wimpSrcByAtomId.set(atomId, wimp)
  if (!activeAtomIndexById.has(atomId)) {
    activeAtomIndexById.set(atomId, gravity$.activeAtomIds.length)
    gravity$.activeAtomIds.push(atomId)
  }
  const atoms = gravity$.atomIdsByWimpSrc.get(wimp) ?? []
  let indexes = atomIndexByWimpSrc.get(wimp)
  if (!indexes) {
    indexes = new Map()
    atomIndexByWimpSrc.set(wimp, indexes)
  }
  if (!indexes.has(atomId)) {
    indexes.set(atomId, atoms.length)
    atoms.push(atomId)
  }
  gravity$.atomIdsByWimpSrc.set(wimp, atoms)
}

const expandAffectedAtoms = (initial: Iterable<number>): Set<number> => {
  const result = new Set(initial)
  const queue = [...result]
  const visitedRuntimeFieldIndexes = new Set<number>()
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const atomId = queue[cursor]!
    for (const key of atomFieldKeysByAtomId.get(atomId) ?? []) {
      const runtimeFieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(key)
      if (runtimeFieldIndex === undefined || visitedRuntimeFieldIndexes.has(runtimeFieldIndex)) continue
      visitedRuntimeFieldIndexes.add(runtimeFieldIndex)
      for (const [memberAtomId] of strong$.atomFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] ?? []) {
        if (result.has(memberAtomId)) continue
        result.add(memberAtomId)
        queue.push(memberAtomId)
      }
    }
  }
  return result
}

const decodeValue = (value: MatrixValue, field: MatrixFieldRecord, strings: string[]): unknown => {
  if (value === null) return null
  if (field.enum !== undefined) return value
  if (field.type === FieldType.STRING_PTR) return strings[Number(value)] ?? ""
  if (field.type === FieldType.ARRAY_PTR && field.elementType === "string" && Array.isArray(value)) {
    return value.map((item) => strings[Number(item)] ?? "")
  }
  return clone(value)
}

const indexPreparedValues = (prepared: MatrixData): Array<Map<number, MatrixValue>> =>
  prepared.branes.map((brane) => {
    const values = new Map<number, MatrixValue>()
    for (let index = brane.localValueOffset; index < brane.localValueOffset + brane.localValueCount; index++) {
      const record = prepared.braneValues[index]
      if (record) values.set(record.fieldIndex, record.value)
    }
    for (let refIndex = brane.sharedBlockRefOffset; refIndex < brane.sharedBlockRefOffset + brane.sharedBlockRefCount; refIndex++) {
      const blockIndex = prepared.braneSharedBlockRefs[refIndex]
      const block = blockIndex === undefined ? undefined : prepared.sharedBlocks[blockIndex]
      if (!block) continue
      for (let index = block.valueOffset; index < block.valueOffset + block.valueCount; index++) {
        const record = prepared.sharedValues[index]
        if (record) values.set(record.fieldIndex, record.value)
      }
    }
    return values
  })

const normalizeConditionValue = (
  value: MatrixConditionRecord["value"],
  sourceField: MatrixFieldRecord,
  targetField: MatrixFieldRecord,
  op: number,
  sourceStrings: string[],
  interner: ReturnType<typeof createStoredStringInterner>,
): MatrixConditionRecord["value"] => {
  if (op === OP.PATTERN || op === OP.EVERY || op === OP.SOME) {
    return clone(value)
  }
  if (op === OP.IS_NULL || op === OP.IS_NOT_NULL || op === OP.RESOLVED) {
    return Number(value)
  }

  const stringArrayOperand = op === OP.ARRAY_EQ
  const stringElementOperand = op === OP.INCLUDE || op === OP.NOT_INCLUDE
  const decodeScalar = (item: unknown): unknown => {
    if (sourceField.enum !== undefined) return item
    if (sourceField.type === FieldType.STRING_PTR) return sourceStrings[Number(item)] ?? ""
    if (
      sourceField.type === FieldType.ARRAY_PTR && sourceField.elementType === "string" &&
      (stringElementOperand || stringArrayOperand)
    ) return sourceStrings[Number(item)] ?? ""
    return item
  }
  const normalizeScalar = (item: unknown): number | boolean => {
    if (targetField.enum !== undefined) return Number(item)
    if (targetField.type === FieldType.STRING_PTR) return interner.intern(String(item))
    if (
      targetField.type === FieldType.ARRAY_PTR && targetField.elementType === "string" &&
      (stringElementOperand || stringArrayOperand)
    ) return interner.intern(String(item))
    if (targetField.type === FieldType.BOOL) return Boolean(item)
    return Number(item)
  }
  return Array.isArray(value)
    ? value.map((item) => normalizeScalar(decodeScalar(item)))
    : normalizeScalar(decodeScalar(value))
}

const extractGraph = (braneIndex: number): Graph => {
  const brane = matrix$.branes[braneIndex]
  if (!brane) return {states: [], transitions: [], conditions: []}
  const states: MatrixStateRecord[] = []
  const transitions: MatrixTransitionRecord[] = []
  const conditions: MatrixConditionRecord[] = []
  for (let stateIndex = 0; stateIndex < brane.stateCount; stateIndex++) {
    const state = matrix$.stateTable[brane.stateOffset + stateIndex]
    if (!state) continue
    const transitionOffset = transitions.length
    for (let index = state.transitionOffset; index < state.transitionOffset + state.transitionCount; index++) {
      const transition = matrix$.transitions[index]
      if (!transition) continue
      const conditionOffset = conditions.length
      for (let conditionIndex = transition.conditionOffset; conditionIndex < transition.conditionOffset + transition.conditionCount; conditionIndex++) {
        const condition = matrix$.conditions[conditionIndex]
        if (condition) conditions.push(clone(condition))
      }
      transitions.push({...transition, conditionOffset, conditionCount: conditions.length - conditionOffset})
    }
    states.push({transitionOffset, transitionCount: transitions.length - transitionOffset})
  }
  return {states, transitions, conditions}
}

const graphSignature = (graph: Graph): string => JSON.stringify({
  graph,
  fields: [...new Set(graph.conditions.map((condition) => condition.fieldIndex))]
    .sort((left, right) => left - right)
    .map((fieldIndex) => [fieldIndex, matrix$.fields[fieldIndex]]),
})

const fragmentGraph = (
  prepared: MatrixData,
  braneIndex: number,
  localToGlobalField: Map<number, number>,
  interner: ReturnType<typeof createStoredStringInterner>,
): Graph => {
  const brane = prepared.branes[braneIndex]
  if (!brane) return {states: [], transitions: [], conditions: []}
  const states: MatrixStateRecord[] = []
  const transitions: MatrixTransitionRecord[] = []
  const conditions: MatrixConditionRecord[] = []
  for (let stateIndex = 0; stateIndex < brane.stateCount; stateIndex++) {
    const state = prepared.stateTable[brane.stateOffset + stateIndex]
    if (!state) continue
    const transitionOffset = transitions.length
    for (let index = state.transitionOffset; index < state.transitionOffset + state.transitionCount; index++) {
      const transition = prepared.transitions[index]
      if (!transition) continue
      const conditionOffset = conditions.length
      for (let conditionIndex = transition.conditionOffset; conditionIndex < transition.conditionOffset + transition.conditionCount; conditionIndex++) {
        const condition = prepared.conditions[conditionIndex]
        if (!condition) continue
        const globalFieldIndex = localToGlobalField.get(condition.fieldIndex)
        const sourceField = prepared.fields[condition.fieldIndex]
        const targetField = globalFieldIndex === undefined ? undefined : matrix$.fields[globalFieldIndex]
        if (globalFieldIndex === undefined || !sourceField || !targetField) continue
        conditions.push({
          fieldIndex: globalFieldIndex,
          op: condition.op,
          value: normalizeConditionValue(
            condition.value,
            sourceField,
            targetField,
            condition.op,
            prepared.stringTable,
            interner,
          ),
        })
      }
      transitions.push({...transition, conditionOffset, conditionCount: conditions.length - conditionOffset})
    }
    states.push({transitionOffset, transitionCount: transitions.length - transitionOffset})
  }
  return {states, transitions, conditions}
}

const reservePackedRange = <T>(
  records: T[],
  currentOffset: number,
  currentCapacity: number,
  required: number,
): {offset: number; capacity: number; reused: boolean} => {
  if (currentCapacity >= required) return {offset: currentOffset, capacity: currentCapacity, reused: true}
  const capacity = nextPackedCapacity(required)
  const offset = records.length
  records.length = offset + capacity
  return {offset, capacity, reused: false}
}

const reserveOwnedPackedRange = <T>(
  records: T[],
  currentOffset: number,
  currentCapacity: number,
  required: number,
  refs: Map<string, number>,
): {offset: number; capacity: number; reused: boolean} => {
  const owners = currentCapacity <= 0 ? 0 : (refs.get(packedRangeKey(currentOffset, currentCapacity)) ?? 0)
  if (required === 0 || (currentCapacity >= required && owners <= 1)) {
    return {offset: currentOffset, capacity: currentCapacity, reused: true}
  }
  removePackedRangeRef(refs, currentOffset, currentCapacity)
  const location = reservePackedRange(records, 0, 0, required)
  addPackedRangeRef(refs, location.offset, location.capacity)
  return location
}

const writeGraph = (braneIndex: number, graph: Graph): {stateOffset: number; stateCount: number} => {
  const conditionLocation = reserveOwnedPackedRange(
    matrix$.conditions,
    graphConditionOffsetsByBraneIndex[braneIndex] ?? 0,
    graphConditionCapacitiesByBraneIndex[braneIndex] ?? 0,
    graph.conditions.length,
    graphConditionRangeRefCounts,
  )
  const transitionLocation = reserveOwnedPackedRange(
    matrix$.transitions,
    graphTransitionOffsetsByBraneIndex[braneIndex] ?? 0,
    graphTransitionCapacitiesByBraneIndex[braneIndex] ?? 0,
    graph.transitions.length,
    graphTransitionRangeRefCounts,
  )
  const stateLocation = reserveOwnedPackedRange(
    matrix$.stateTable,
    graphStateOffsetsByBraneIndex[braneIndex] ?? 0,
    graphStateCapacitiesByBraneIndex[braneIndex] ?? 0,
    graph.states.length,
    graphStateRangeRefCounts,
  )

  graph.conditions.forEach((condition, index) => {
    matrix$.conditions[conditionLocation.offset + index] = condition
  })
  graph.transitions.forEach((transition, index) => {
    matrix$.transitions[transitionLocation.offset + index] = {
      ...transition,
      conditionOffset: conditionLocation.offset + transition.conditionOffset,
    }
  })
  graph.states.forEach((state, index) => {
    matrix$.stateTable[stateLocation.offset + index] = {
      ...state,
      transitionOffset: transitionLocation.offset + state.transitionOffset,
    }
  })

  graphConditionOffsetsByBraneIndex[braneIndex] = conditionLocation.offset
  graphConditionCapacitiesByBraneIndex[braneIndex] = conditionLocation.capacity
  graphTransitionOffsetsByBraneIndex[braneIndex] = transitionLocation.offset
  graphTransitionCapacitiesByBraneIndex[braneIndex] = transitionLocation.capacity
  graphStateOffsetsByBraneIndex[braneIndex] = stateLocation.offset
  graphStateCapacitiesByBraneIndex[braneIndex] = stateLocation.capacity
  return {stateOffset: stateLocation.offset, stateCount: graph.states.length}
}

const writeBraneValues = (
  braneIndex: number,
  brane: MatrixBraneRecord | undefined,
  values: Array<{fieldIndex: number; value: MatrixValue}>,
): {offset: number; reused: boolean} => {
  const location = reservePackedRange(
    matrix$.braneValues,
    brane?.localValueOffset ?? 0,
    braneValueCapacities[braneIndex] ?? brane?.localValueCount ?? 0,
    values.length,
  )
  for (let index = 0; index < values.length; index++) matrix$.braneValues[location.offset + index] = values[index]!
  braneValueCapacities[braneIndex] = location.capacity
  return {offset: location.offset, reused: location.reused}
}

const writeBraneSharedRefs = (
  braneIndex: number,
  brane: MatrixBraneRecord | undefined,
  refs: number[],
): {offset: number; reused: boolean} => {
  const location = reservePackedRange(
    matrix$.braneSharedBlockRefs,
    brane?.sharedBlockRefOffset ?? 0,
    braneSharedRefCapacities[braneIndex] ?? brane?.sharedBlockRefCount ?? 0,
    refs.length,
  )
  for (let index = 0; index < refs.length; index++) matrix$.braneSharedBlockRefs[location.offset + index] = refs[index]!
  braneSharedRefCapacities[braneIndex] = location.capacity
  return {offset: location.offset, reused: location.reused}
}

const writeSharedValue = (
  blockIndex: number,
  value: {fieldIndex: number; value: MatrixValue},
): boolean => {
  const location = reservePackedRange(
    matrix$.sharedValues,
    sharedValueOffsetsByBlockIndex[blockIndex] ?? 0,
    sharedValueCapacitiesByBlockIndex[blockIndex] ?? 0,
    1,
  )
  matrix$.sharedValues[location.offset] = value
  matrix$.sharedBlocks[blockIndex] = {valueOffset: location.offset, valueCount: 1}
  sharedValueOffsetsByBlockIndex[blockIndex] = location.offset
  sharedValueCapacitiesByBlockIndex[blockIndex] = location.capacity
  return location.reused
}

/**
 * Перестраивает только затронутую часть Store и сообщает Weak точные области
 * синхронизации.
 *
 * @param change Граница изменения, вычисленная локальной проекцией.
 * @returns Адреса синхронизации Weak, сохранённые и аннулированные Process.
 */
export async function applyIncrementalMatrixProjection(
  change: MatrixProjectionChange,
): Promise<IncrementalMatrixResult> {
  if (!incrementalIndexesInitialized) {
    throw new Error("Matrix incremental indexes are not initialized")
  }
  const affectedAtomIds = expandAffectedAtoms(change.affectedAtomIds)
  const fragment = readMatrixProjectionFragment(affectedAtomIds)
  const snapshot = buildMatrixRuntime(fragment)
  const prepared = assembleStoredMatrixData(flattenMatrixData(snapshot.data))
  const preparedValuesByBrane = indexPreparedValues(prepared)
  const invalidatedWimps = new Set(change.invalidatedProcessWimps)
  const explicitlyInvalidatedAtoms = new Set(change.invalidatedProcessAtomIds)
  const stats: IncrementalMatrixStats = {
    projectionAtoms: fragment.atoms.length,
    touchedBranes: affectedAtomIds.size,
    reusedBranes: 0,
    appendedBranes: 0,
    reusedGraphs: 0,
    appendedGraphs: 0,
    reusedSharedBlocks: 0,
    appendedSharedBlocks: 0,
  }

  const fragmentBraneByAtomId = new Map(snapshot.runtime.braneIndexByAtomId)
  const membersByLocalField = new Map<number, Array<[atomId: number, fieldId: number]>>()
  const localFieldsByAtomId = new Map<number, Array<[localFieldIndex: number, fieldId: number]>>()
  for (const [atomId, fieldId, localFieldIndex] of snapshot.runtime.runtimeFieldIndexByAtomFieldId) {
    const members = membersByLocalField.get(localFieldIndex)
    if (members) members.push([atomId, fieldId])
    else membersByLocalField.set(localFieldIndex, [[atomId, fieldId]])
    const localFields = localFieldsByAtomId.get(atomId)
    if (localFields) localFields.push([localFieldIndex, fieldId])
    else localFieldsByAtomId.set(atomId, [[localFieldIndex, fieldId]])
  }

  const oldBraneByAtomId = new Map<number, number>()
  const oldWimpByAtomId = new Map<number, string>()
  const oldRuntimeFieldByKey = new Map<string, number>()
  const oldSharedRefsByBrane = new Map<number, number[]>()
  const oldSharedBlockByBraneField = new Map<string, number>()
  for (const atomId of affectedAtomIds) {
    const braneIndex = gravity$.getBraneIndexByAtomId(atomId)
    if (braneIndex !== undefined) oldBraneByAtomId.set(atomId, braneIndex)
    if (braneIndex !== undefined) {
      const brane = matrix$.branes[braneIndex]
      if (brane) {
        const refs: number[] = []
        for (let index = brane.sharedBlockRefOffset; index < brane.sharedBlockRefOffset + brane.sharedBlockRefCount; index++) {
          const blockIndex = matrix$.braneSharedBlockRefs[index]
          const block = blockIndex === undefined ? undefined : matrix$.sharedBlocks[blockIndex]
          if (blockIndex === undefined || !block) continue
          refs.push(blockIndex)
          for (let valueIndex = block.valueOffset; valueIndex < block.valueOffset + block.valueCount; valueIndex++) {
            const record = matrix$.sharedValues[valueIndex]
            if (record) oldSharedBlockByBraneField.set(`${braneIndex}\0${record.fieldIndex}`, blockIndex)
          }
        }
        oldSharedRefsByBrane.set(braneIndex, refs)
      }
    }
    const wimp = gravity$.getWimpSrcByAtomId(atomId)
    if (wimp !== undefined) oldWimpByAtomId.set(atomId, wimp)
    for (const key of atomFieldKeysByAtomId.get(atomId) ?? []) {
      const runtimeFieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(key)
      if (runtimeFieldIndex !== undefined) oldRuntimeFieldByKey.set(key, runtimeFieldIndex)
    }
  }

  detachAffectedFieldMemberships(affectedAtomIds)
  for (const atomId of affectedAtomIds) clearAtomFieldMappings(atomId)

  const claimedGlobalFields = new Set<number>()
  const localToGlobalField = new Map<number, number>()
  for (const [localFieldIndex, members] of membersByLocalField) {
    const candidateCounts = new Map<number, number>()
    for (const [atomId, fieldId] of members) {
      const candidate = oldRuntimeFieldByKey.get(atomFieldKey(atomId, fieldId))
      if (candidate !== undefined && !claimedGlobalFields.has(candidate)) {
        candidateCounts.set(candidate, (candidateCounts.get(candidate) ?? 0) + 1)
      }
    }
    let candidate: number | undefined
    let candidateCount = -1
    for (const [candidateIndex, count] of candidateCounts) {
      if (count > candidateCount || (count === candidateCount && candidateIndex < (candidate ?? Number.MAX_SAFE_INTEGER))) {
        candidate = candidateIndex
        candidateCount = count
      }
    }
    const globalFieldIndex = candidate ?? takeFreeIndex(freeFieldIndexes) ?? matrix$.fields.length
    const descriptor = prepared.fields[localFieldIndex]
    if (!descriptor) continue
    matrix$.fields[globalFieldIndex] = clone(descriptor)
    claimFreeIndex(freeFieldIndexes, globalFieldIndex)
    claimedGlobalFields.add(globalFieldIndex)
    localToGlobalField.set(localFieldIndex, globalFieldIndex)
  }

  const stableBraneByAtomId = new Map<number, number>()
  for (const atom of fragment.atoms) {
    const existing = oldBraneByAtomId.get(atom.id)
    const braneIndex = existing ?? takeFreeIndex(freeBraneIndexes) ?? matrix$.branes.length
    stableBraneByAtomId.set(atom.id, braneIndex)
    if (existing === undefined) stats.appendedBranes++
    else stats.reusedBranes++
    indexGravityAtom(atom.id, braneIndex, atom.wimp)
  }

  for (const [localFieldIndex, members] of membersByLocalField) {
    const globalFieldIndex = localToGlobalField.get(localFieldIndex)
    const field = globalFieldIndex === undefined ? undefined : matrix$.fields[globalFieldIndex]
    if (globalFieldIndex === undefined || !field) continue
    for (const [atomId, fieldId] of members) {
      const braneIndex = stableBraneByAtomId.get(atomId)
      if (braneIndex === undefined) continue
      addAtomFieldMapping(
        atomId,
        fieldId,
        braneIndex,
        globalFieldIndex,
        field.enum !== undefined || field.type === FieldType.ARRAY_PTR,
      )
    }
  }

  const interner = createStoredStringInterner(matrix$.stringTable)
  const sharedBlockByLocalField = new Map<number, number>()
  const changedSharedBlockIndexes = new Set<number>()
  const claimedSharedBlockIndexes = new Set<number>()
  for (const [localFieldIndex, members] of membersByLocalField) {
    if (members.length < 2) continue
    const globalFieldIndex = localToGlobalField.get(localFieldIndex)
    const sourceField = prepared.fields[localFieldIndex]
    const targetField = globalFieldIndex === undefined ? undefined : matrix$.fields[globalFieldIndex]
    const firstBrane = fragmentBraneByAtomId.get(members[0]![0])
    const value = firstBrane === undefined ? undefined : preparedValuesByBrane[firstBrane]?.get(localFieldIndex)
    if (globalFieldIndex === undefined || !sourceField || !targetField || value === undefined) continue

    const previousBlocks = new Set<number>()
    for (const [atomId, fieldId] of members) {
      const oldBrane = oldBraneByAtomId.get(atomId)
      const oldField = oldRuntimeFieldByKey.get(atomFieldKey(atomId, fieldId))
      if (oldBrane === undefined || oldField === undefined) continue
      const previousBlock = oldSharedBlockByBraneField.get(`${oldBrane}\0${oldField}`)
      if (previousBlock !== undefined) previousBlocks.add(previousBlock)
    }
    const previousBlockIndex = previousBlocks.size === 1 ? [...previousBlocks][0] : undefined
    const reusable = previousBlockIndex !== undefined && !claimedSharedBlockIndexes.has(previousBlockIndex)
      ? previousBlockIndex
      : undefined
    const blockIndex = reusable ?? takeFreeIndex(freeSharedBlockIndexes) ?? matrix$.sharedBlocks.length
    claimedSharedBlockIndexes.add(blockIndex)
    const normalized = normalizeFieldValue(decodeValue(value, sourceField, prepared.stringTable), targetField, interner)
    const reusedStorage = writeSharedValue(blockIndex, {fieldIndex: globalFieldIndex, value: normalized})
    if (reusedStorage) stats.reusedSharedBlocks++
    else stats.appendedSharedBlocks++
    sharedBlockByLocalField.set(localFieldIndex, blockIndex)
    changedSharedBlockIndexes.add(blockIndex)
  }

  const invalidatedAtomIds = new Set<number>()
  const preservedProcessStates: IncrementalMatrixResult["preservedProcessStates"] = []
  const processCandidateBraneIndexes = new Set<number>()
  const graphBraneIndexes = new Set<number>()
  const changedBraneIndexes = new Set<number>()

  for (const atom of fragment.atoms) {
    const fragmentBraneIndex = fragmentBraneByAtomId.get(atom.id)
    const braneIndex = stableBraneByAtomId.get(atom.id)
    if (fragmentBraneIndex === undefined || braneIndex === undefined) continue
    const previousBrane = matrix$.branes[braneIndex]
    const previousStateIndex = matrix$.states[braneIndex]
    const previousMetaStateId = previousStateIndex === undefined || previousStateIndex < 0
      ? undefined
      : weak$.stateMetaStateIdsByBraneIndex[braneIndex]?.[previousStateIndex]
    const previousWimp = oldWimpByAtomId.get(atom.id)
    const previousLock = previousBrane?.lock === true

    const localValues: Array<{fieldIndex: number; value: MatrixValue}> = []
    const sharedRefs: number[] = []
    for (const [localFieldIndex] of localFieldsByAtomId.get(atom.id) ?? []) {
      const globalFieldIndex = localToGlobalField.get(localFieldIndex)
      const sourceField = prepared.fields[localFieldIndex]
      const targetField = globalFieldIndex === undefined ? undefined : matrix$.fields[globalFieldIndex]
      const value = preparedValuesByBrane[fragmentBraneIndex]?.get(localFieldIndex)
      if (globalFieldIndex === undefined || !sourceField || !targetField || value === undefined) continue
      const sharedBlock = sharedBlockByLocalField.get(localFieldIndex)
      if (sharedBlock !== undefined) sharedRefs.push(sharedBlock)
      else localValues.push({
        fieldIndex: globalFieldIndex,
        value: normalizeFieldValue(decodeValue(value, sourceField, prepared.stringTable), targetField, interner),
      })
    }

    const nextGraph = fragmentGraph(prepared, fragmentBraneIndex, localToGlobalField, interner)
    const nextGraphSignature = graphSignature(nextGraph)
    const graphUnchanged = previousBrane !== undefined && graphSignaturesByBraneIndex[braneIndex] === nextGraphSignature
    const graphLocation = graphUnchanged
      ? {stateOffset: previousBrane.stateOffset, stateCount: previousBrane.stateCount}
      : writeGraph(braneIndex, nextGraph)
    if (graphUnchanged) stats.reusedGraphs++
    else {
      stats.appendedGraphs++
      graphBraneIndexes.add(braneIndex)
    }
    graphSignaturesByBraneIndex[braneIndex] = nextGraphSignature

    const valuesLocation = writeBraneValues(braneIndex, previousBrane, localValues)
    const refsLocation = writeBraneSharedRefs(braneIndex, previousBrane, sharedRefs)
    const stateNames = clone(snapshot.data.stateNames[fragmentBraneIndex] ?? [])
    const selectedState = prepared.states[fragmentBraneIndex] ?? STATE_NONE
    const nextStateMetaStateIds = clone(snapshot.weak.stateMetaStateIdsByBraneIndex[fragmentBraneIndex] ?? [])
    const nextStateHasProcess = clone(snapshot.weak.stateHasProcessByBraneIndex[fragmentBraneIndex] ?? [])
    const nextMetaStateId = selectedState < 0 ? undefined : nextStateMetaStateIds[selectedState]
    const processInvalidated = explicitlyInvalidatedAtoms.has(atom.id) ||
      invalidatedWimps.has(atom.wimp) || previousWimp !== atom.wimp
    const preserveLock = previousLock && !processInvalidated && previousMetaStateId !== undefined &&
      previousMetaStateId === nextMetaStateId && nextStateHasProcess[selectedState] === true
    if (previousLock && !preserveLock) invalidatedAtomIds.add(atom.id)
    if (preserveLock) preservedProcessStates.push({atomId: atom.id, braneIndex, stateIndex: selectedState})

    const nextBrane: MatrixBraneRecord = previousBrane ?? {
      localValueOffset: 0,
      localValueCount: 0,
      sharedBlockRefOffset: 0,
      sharedBlockRefCount: 0,
      stateOffset: 0,
      stateCount: 0,
      lock: false,
    }
    nextBrane.localValueOffset = valuesLocation.offset
    nextBrane.localValueCount = localValues.length
    nextBrane.sharedBlockRefOffset = refsLocation.offset
    nextBrane.sharedBlockRefCount = sharedRefs.length
    nextBrane.stateOffset = graphLocation.stateOffset
    nextBrane.stateCount = graphLocation.stateCount
    nextBrane.lock = preserveLock
    matrix$.branes[braneIndex] = nextBrane
    matrix$.states[braneIndex] = selectedState
    matrix$.stateNames[braneIndex] = stateNames
    weak$.stateMetaStateIdsByBraneIndex[braneIndex] = nextStateMetaStateIds
    weak$.stateHasProcessByBraneIndex[braneIndex] = nextStateHasProcess
    if (!preserveLock && selectedState >= 0 && weak$.stateHasProcessByBraneIndex[braneIndex]?.[selectedState] === true) {
      processCandidateBraneIndexes.add(braneIndex)
    }
    changedBraneIndexes.add(braneIndex)
  }

  for (const atomId of affectedAtomIds) {
    if (fragmentBraneByAtomId.has(atomId)) continue
    const braneIndex = removeGravityAtom(atomId)
    clearAtomFieldMappings(atomId)
    invalidatedAtomIds.add(atomId)
    if (braneIndex === undefined) continue
    const brane = matrix$.branes[braneIndex]
    if (brane) {
      brane.localValueCount = 0
      brane.sharedBlockRefCount = 0
      brane.lock = false
    }
    matrix$.states[braneIndex] = STATE_NONE
    matrix$.stateNames[braneIndex] = []
    weak$.stateMetaStateIdsByBraneIndex[braneIndex] = []
    weak$.stateHasProcessByBraneIndex[braneIndex] = []
    changedBraneIndexes.add(braneIndex)
  }

  const possiblyFreedSharedBlocks = new Set<number>()
  for (const oldRefs of oldSharedRefsByBrane.values()) {
    for (const blockIndex of oldRefs) {
      sharedBlockRefCounts[blockIndex] = Math.max(0, (sharedBlockRefCounts[blockIndex] ?? 0) - 1)
      possiblyFreedSharedBlocks.add(blockIndex)
    }
  }
  for (const braneIndex of changedBraneIndexes) {
    const brane = matrix$.branes[braneIndex]
    if (!brane) continue
    for (let index = brane.sharedBlockRefOffset; index < brane.sharedBlockRefOffset + brane.sharedBlockRefCount; index++) {
      const blockIndex = matrix$.braneSharedBlockRefs[index]
      if (blockIndex !== undefined) sharedBlockRefCounts[blockIndex] = (sharedBlockRefCounts[blockIndex] ?? 0) + 1
    }
  }
  for (const blockIndex of possiblyFreedSharedBlocks) {
    if ((sharedBlockRefCounts[blockIndex] ?? 0) === 0) {
      addFreeIndex(freeSharedBlockIndexes, blockIndex)
      matrix$.sharedBlocks[blockIndex] = {
        valueOffset: sharedValueOffsetsByBlockIndex[blockIndex] ?? matrix$.sharedBlocks[blockIndex]?.valueOffset ?? 0,
        valueCount: 0,
      }
      changedSharedBlockIndexes.add(blockIndex)
    } else {
      claimFreeIndex(freeSharedBlockIndexes, blockIndex)
    }
  }
  while (matrix$.sharedBlocks.length > 0) {
    const blockIndex = matrix$.sharedBlocks.length - 1
    if ((sharedBlockRefCounts[blockIndex] ?? 0) !== 0) break
    matrix$.sharedBlocks.pop()
    sharedBlockRefCounts.pop()
    claimFreeIndex(freeSharedBlockIndexes, blockIndex)
  }

  gravity$.structuralDirty = false
  return {
    weakUpdate: {
      braneIndexes: [...changedBraneIndexes],
      sharedBlockIndexes: [...changedSharedBlockIndexes],
      graphBraneIndexes: [...graphBraneIndexes],
    },
    invalidatedAtomIds: [...invalidatedAtomIds],
    preservedProcessStates,
    processCandidateBraneIndexes: [...processCandidateBraneIndexes],
    stats,
  }
}
