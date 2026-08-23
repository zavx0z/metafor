import type { BoundaryInitialState } from "@metafor/types/boundary/initial"
import { resolveForceFieldsPayload } from "shared/protocol/force/fields"
import type { ForceMessage } from "shared/protocol/force/message"
import type { Particle } from "shared/protocol/force/particle"
import type {
  MatrixBraneRecord,
  MatrixConditionRecord,
  MatrixFieldValueRecord,
  MatrixScalarValue,
  MatrixStateRecord,
  MatrixStore,
  MatrixTransitionRecord,
  MatrixValue,
} from "@matrix/types/store"
import type { MatrixRuntimeAtomEntity } from "@matrix/types/runtime"
import type { MatrixFieldRecord } from "@matrix/types/data"
import { applyMatrixProjectionParticle, readMatrixProjectionFragment } from "./projection.ts"
import { prepareMatrixData } from "./prepare.ts"
import { buildMatrixRuntime } from "./birth.ts"
import { gravity$ } from "gravity/store.ts"
import { strong$ } from "strong"
import { weak$, weakStructuralUpdate } from "weak"
import { normalizeFieldValue } from "./strong/normalize.ts"
import { createStoredStringInterner } from "./strong/string-table.ts"

export type MatrixIncrementalResult = {
  changed: boolean
  structural: boolean
  affectedAtomIds: number[]
}

const UNCHANGED: MatrixIncrementalResult = { changed: false, structural: false, affectedAtomIds: [] }

const unique = (values: Iterable<number>): number[] => [...new Set(values)]
const atomFieldKey = (atomId: number, fieldId: number): string => `${atomId}\0${fieldId}`

const currentBraneIndex = (atomId: number): number | undefined => gravity$.getBraneIndexByAtomId(atomId)

const cloneRows = <T>(rows: readonly T[]): T[] => rows.map((row) => structuredClone(row))

const fieldDefinition = (field: MatrixFieldRecord | undefined): MatrixFieldRecord | undefined => field

const normalizeRuntimeValue = (value: unknown, field: MatrixFieldRecord | undefined): MatrixValue => {
  if (!field) throw new Error("Matrix incremental update requires the Field definition")
  const interner = createStoredStringInterner(weak$.matrix$?.stringTable ?? [""])
  const normalized = normalizeFieldValue(value, fieldDefinition(field), interner)
  if (weak$.matrix$) weak$.matrix$.stringTable = interner.table
  return normalized
}

const collectBraneIndexes = (atomIds: readonly number[]): number[] =>
  atomIds.flatMap((atomId) => {
    const index = currentBraneIndex(atomId)
    return index === undefined ? [] : [index]
  })

const removeAt = <T>(rows: T[], index: number, count: number): void => {
  if (count > 0) rows.splice(index, count)
}

const appendRows = <T>(target: T[], rows: readonly T[]): { offset: number; count: number } => {
  const offset = target.length
  target.push(...cloneRows(rows))
  return { offset, count: rows.length }
}

const rewriteStateGraph = (
  store: MatrixStore,
  oldBrane: MatrixBraneRecord,
  nextStore: MatrixStore,
  nextBrane: MatrixBraneRecord,
): { stateOffset: number; stateCount: number } => {
  const stateRows = nextStore.stateTable.slice(nextBrane.stateOffset, nextBrane.stateOffset + nextBrane.stateCount)
  const transitionIndexes = new Set<number>()
  const conditionIndexes = new Set<number>()
  for (const state of stateRows) {
    for (let index = state.transitionOffset; index < state.transitionOffset + state.transitionCount; index++) {
      transitionIndexes.add(index)
      const transition = nextStore.transitions[index]
      if (!transition) continue
      for (let conditionIndex = transition.conditionOffset; conditionIndex < transition.conditionOffset + transition.conditionCount; conditionIndex++) {
        conditionIndexes.add(conditionIndex)
      }
    }
  }

  const conditions: MatrixConditionRecord[] = [...conditionIndexes].sort((a, b) => a - b)
    .map((index) => nextStore.conditions[index]!).filter(Boolean)
  const conditionOffset = store.conditions.length
  store.conditions.push(...cloneRows(conditions))
  const firstNextCondition = conditionIndexes.size > 0 ? Math.min(...conditionIndexes) : 0

  const transitions: MatrixTransitionRecord[] = [...transitionIndexes].sort((a, b) => a - b)
    .map((index) => nextStore.transitions[index]!).filter(Boolean)
    .map((transition) => ({
      ...structuredClone(transition),
      conditionOffset: conditionOffset + transition.conditionOffset - firstNextCondition,
    }))
  const transitionOffset = store.transitions.length
  store.transitions.push(...transitions)
  const firstNextTransition = transitionIndexes.size > 0 ? Math.min(...transitionIndexes) : 0

  const stateOffset = store.stateTable.length
  store.stateTable.push(...stateRows.map((state) => ({
    ...structuredClone(state),
    transitionOffset: transitionOffset + state.transitionOffset - firstNextTransition,
  })))

  // Old rows stay unreachable. Weak structural replacement recompiles only this Brane.
  void oldBrane
  return { stateOffset, stateCount: stateRows.length }
}

const rewriteLocalValues = (
  store: MatrixStore,
  nextStore: MatrixStore,
  nextBrane: MatrixBraneRecord,
): { localValueOffset: number; localValueCount: number } => {
  const rows = nextStore.braneValues.slice(
    nextBrane.localValueOffset,
    nextBrane.localValueOffset + nextBrane.localValueCount,
  )
  const appended = appendRows(store.braneValues, rows)
  return { localValueOffset: appended.offset, localValueCount: appended.count }
}

const rewriteSharedRefs = (
  store: MatrixStore,
  nextStore: MatrixStore,
  nextBrane: MatrixBraneRecord,
  sharedBlockMap: Map<number, number>,
): { sharedBlockRefOffset: number; sharedBlockRefCount: number } => {
  const refs = nextStore.braneSharedBlockRefs.slice(
    nextBrane.sharedBlockRefOffset,
    nextBrane.sharedBlockRefOffset + nextBrane.sharedBlockRefCount,
  ).map((ref) => sharedBlockMap.get(ref) ?? ref)
  const offset = store.braneSharedBlockRefs.length
  store.braneSharedBlockRefs.push(...refs)
  return { sharedBlockRefOffset: offset, sharedBlockRefCount: refs.length }
}

const appendSharedBlocks = (
  store: MatrixStore,
  nextStore: MatrixStore,
): Map<number, number> => {
  const map = new Map<number, number>()
  nextStore.sharedBlocks.forEach((block, sourceIndex) => {
    const rows = nextStore.sharedValues.slice(block.valueOffset, block.valueOffset + block.valueCount)
    const values = appendRows(store.sharedValues, rows)
    const targetIndex = store.sharedBlocks.length
    store.sharedBlocks.push({ valueOffset: values.offset, valueCount: values.count })
    map.set(sourceIndex, targetIndex)
  })
  return map
}

const rebuildRuntimeIndexes = (
  affectedAtomIds: readonly number[],
  runtime: ReturnType<typeof buildMatrixRuntime>,
): void => {
  const affected = new Set(affectedAtomIds)
  for (const atomId of affected) {
    gravity$.atomIdToBraneIndex.delete(atomId)
    gravity$.wimpSrcByAtomId.delete(atomId)
  }
  for (const [src, atomIds] of gravity$.atomIdsByWimpSrc) {
    const next = atomIds.filter((atomId) => !affected.has(atomId))
    if (next.length === 0) gravity$.atomIdsByWimpSrc.delete(src)
    else gravity$.atomIdsByWimpSrc.set(src, next)
  }
  for (const [atomId, braneIndex] of runtime.runtime.braneIndexByAtomId) {
    gravity$.atomIdToBraneIndex.set(atomId, braneIndex)
  }
  for (const [atomId, src] of runtime.runtime.wimpSrcByAtomId) {
    gravity$.wimpSrcByAtomId.set(atomId, src)
    const ids = gravity$.atomIdsByWimpSrc.get(src)
    if (ids) ids.push(atomId)
    else gravity$.atomIdsByWimpSrc.set(src, [atomId])
  }
}

const rebuildStrongIndexes = (
  affectedAtomIds: readonly number[],
  runtime: ReturnType<typeof buildMatrixRuntime>,
): void => {
  const affected = new Set(affectedAtomIds)
  for (const key of [...strong$.runtimeFieldIndexByAtomFieldId.keys()]) {
    const atomId = Number(key.slice(0, key.indexOf("\0")))
    if (affected.has(atomId)) strong$.runtimeFieldIndexByAtomFieldId.delete(key)
  }
  strong$.topologyAtomFieldIds = new Set(
    [...strong$.topologyAtomFieldIds].filter((key) => !affected.has(Number(key.slice(0, key.indexOf("\0"))))),
  )
  for (const [atomId, fieldId, runtimeFieldIndex] of runtime.runtime.runtimeFieldIndexByAtomFieldId) {
    strong$.runtimeFieldIndexByAtomFieldId.set(atomFieldKey(atomId, fieldId), runtimeFieldIndex)
  }
  for (const [atomId, fieldId] of runtime.strong.topologyAtomFieldIds) {
    strong$.topologyAtomFieldIds.add(atomFieldKey(atomId, fieldId))
  }
  strong$.runtimeFieldIndexByWimpFieldId = new Map(runtime.strong.runtimeFieldIndexByWimpFieldId)
  strong$.wimpFieldIdsByRuntimeFieldIndex = runtime.strong.wimpFieldIdsByRuntimeFieldIndex.map((ids) => [...ids])
  strong$.braneIndexByWimpFieldId = new Map(runtime.strong.braneIndexByWimpFieldId)
  strong$.topologyWimpFieldIds = new Set(runtime.strong.topologyWimpFieldIds)
}

const rebuildWeakIndexes = (runtime: ReturnType<typeof buildMatrixRuntime>): void => {
  weak$.stateMetaStateIdsByBraneIndex = runtime.weak.stateMetaStateIdsByBraneIndex.map((ids) => [...ids])
  weak$.stateHasProcessByBraneIndex = runtime.weak.stateHasProcessByBraneIndex.map((items) => [...items])
}

const applyStructuralFragment = (
  affectedAtomIds: readonly number[],
  fragment: BoundaryInitialState,
): MatrixIncrementalResult => {
  const store = weak$.matrix$
  if (!store) return UNCHANGED
  const runtime = buildMatrixRuntime(fragment)
  const nextStore = prepareMatrixData(runtime.data)
  const existing = new Map<number, number>()
  affectedAtomIds.forEach((atomId) => {
    const index = currentBraneIndex(atomId)
    if (index !== undefined) existing.set(atomId, index)
  })

  // If membership changes, local offsets cease to be stable: rebuild current projection.
  if (nextStore.branes.length !== existing.size) return {changed: true, structural: true, affectedAtomIds: [...affectedAtomIds]}

  const sharedBlockMap = appendSharedBlocks(store, nextStore)
  const touchedBranes: number[] = []
  runtime.runtime.atomIdByBraneIndex.forEach((atomId, sourceBraneIndex) => {
    const targetBraneIndex = existing.get(atomId)
    if (targetBraneIndex === undefined) return
    const oldBrane = store.branes[targetBraneIndex]!
    const nextBrane = nextStore.branes[sourceBraneIndex]!
    const local = rewriteLocalValues(store, nextStore, nextBrane)
    const shared = rewriteSharedRefs(store, nextStore, nextBrane, sharedBlockMap)
    const states = rewriteStateGraph(store, oldBrane, nextStore, nextBrane)
    store.branes[targetBraneIndex] = {
      ...local,
      ...shared,
      ...states,
      lock: nextBrane.lock,
    }
    store.states[targetBraneIndex] = nextStore.states[sourceBraneIndex] ?? store.states[targetBraneIndex]!
    store.stateNames[targetBraneIndex] = [...(nextStore.stateNames[sourceBraneIndex] ?? [])]
    touchedBranes.push(targetBraneIndex)
  })
  rebuildRuntimeIndexes(affectedAtomIds, runtime)
  rebuildStrongIndexes(affectedAtomIds, runtime)
  rebuildWeakIndexes(runtime)
  weakStructuralUpdate({
    braneIndexes: touchedBranes,
    sharedBlockIndexes: [...sharedBlockMap.values()],
    graphBraneIndexes: touchedBranes,
  })
  return {changed: touchedBranes.length > 0, structural: true, affectedAtomIds: [...affectedAtomIds]}
}

const updateScalarFields = (part: Particle): MatrixIncrementalResult => {
  if (typeof part.path !== "number") return UNCHANGED
  const fields = resolveForceFieldsPayload(part.value)
  if (!fields) return UNCHANGED
  const atomId = part.path
  const braneIndex = currentBraneIndex(atomId)
  if (braneIndex === undefined) return UNCHANGED
  const store = weak$.matrix$
  if (!store) return UNCHANGED
  const updates: Array<{kind: "field"; braneIndex: number; fieldIndex: number}> = []
  for (const [fieldAddress, value] of Object.entries(fields)) {
    const fieldId = Number(fieldAddress)
    const fieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(atomFieldKey(atomId, fieldId))
    if (fieldIndex === undefined) continue
    const location = store.getFieldLocation(braneIndex, fieldIndex)
    if (!location) continue
    if (part.op === "remove") location.record.value = null
    else if (part.op === "add" || part.op === "replace") location.record.value = normalizeRuntimeValue(value, store.fields[fieldIndex])
    else continue
    updates.push({kind: "field", braneIndex, fieldIndex})
  }
  if (updates.length === 0) return UNCHANGED
  weak$.runtime?.heapUpdate(updates)
  return {changed: true, structural: false, affectedAtomIds: [atomId]}
}

export const applyIncrementalMatrixProjection = (part: Particle): MatrixIncrementalResult => {
  const projection = applyMatrixProjectionParticle(part)
  const fieldUpdate = part.part === "gluon" || part.part === "higgs" ? updateScalarFields(part) : UNCHANGED
  if (!projection.structural) return fieldUpdate
  const affectedAtomIds = unique(projection.affectedAtomIds)
  const fragment = readMatrixProjectionFragment(affectedAtomIds)
  const structural = applyStructuralFragment(affectedAtomIds, fragment)
  return {
    changed: projection.structural || structural.changed,
    structural: true,
    affectedAtomIds,
  }
}

export const applyIncrementalMatrixMessage = (message: ForceMessage): MatrixIncrementalResult => {
  let changed = false
  let structural = false
  const affected = new Set<number>()
  for (const part of message.parts) {
    const result = applyIncrementalMatrixProjection(part)
    changed ||= result.changed
    structural ||= result.structural
    for (const atomId of result.affectedAtomIds) affected.add(atomId)
  }
  return {changed, structural, affectedAtomIds: [...affected]}
}
