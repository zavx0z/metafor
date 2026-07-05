/**
 * matrix — доменный оркестратор детерминированного перехода состояний.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * - `write()` — запись канонической matrix-структуры в доменный store
 * - `gravity$` — runtime-адресация materialized branes
 * - `update()` — обновление полей и вычисление следующего перехода
 * - `BroadcastChannel("force")` — физическая подписка на Force и dispatch в Matrix pipeline
 * - `unlock()` — снятие блокировки с бран
 *
 * ## Архитектура
 *
 * Matrix раскладывает уже подготовленную matrix-форму через
 * `@matrix/gravity`, собирает канонический store через `@matrix/strong`
 * и оркестрирует вычисление перехода через `@matrix/weak`.
 *
 * Matrix работает с уже подготовленным runtime-снимком. Persistent Boundary DB
 * принадлежит Dark, а Matrix держит только runtime-состояние процесса.
 *
 * Matrix НЕ содержит:
 * - source graph loading и primary addressing — это `dark`
 * - раскладку структуры и проверку входа — это `@matrix/gravity`
 * - канонизацию и сборку store-формы — это `@matrix/strong`
 * - вычисление перехода и backend-адаптеры — это `@matrix/weak`
 */

import { gravity$ } from "@matrix/gravity/store.ts"
import { matrix$ } from "./store"
import type {
  MatrixData,
  MatrixFieldRecord,
  MatrixFieldValueRecord,
  MatrixInputData,
  MatrixRuntimeSnapshot,
  MatrixStore,
} from "@metafor/types/matrix"
import { FieldType, flattenMatrixData, validateData } from "@matrix/gravity"
import { createStoredStringInterner, normalizeFieldValue, assembleStoredMatrixData, strong$ } from "@matrix/strong"
import { StepMode, weakHeapUpdate, weakInit, weakRunStep, weak$ } from "@matrix/weak"
import {resolveForceFieldId, resolveForceFieldsPayload} from "../boundary/force-fields.ts"
import type {ForceMessage, Particle} from "@metafor/types/force"

export const force = new BroadcastChannel("force")

force.onmessage = async (event) => {
  for (const part of (event.data as ForceMessage).parts) {
    switch (part.part) {
      case "gluon":
        await applyRuntimeFieldParts([part], "gluon")
        break
      case "higgs":
        await applyRuntimeFieldParts([part], "higgs")
        break
      case "z":
        applyEnergyExecutionRequest(part)
        break
      case "w+":
      case "w-":
        await applyActorWeakResult(part)
        break
    }
  }
}

type MatrixPendingProcessExecution = {
  braneIndex: number
  stateIndex: number
  fields: Record<string, unknown>
  acceptedEnergy?: string
}

type AsyncGate = {
  pending: null | Promise<void>
}

const writeGate: AsyncGate = { pending: null }
const updateGate: AsyncGate = { pending: null }
const pendingProcessExecutionsByActorId = new Map<number, MatrixPendingProcessExecution>()

const actorFieldKey = (actorId: number, fieldId: number): string =>
  `${actorId}\0${fieldId}`

const runExclusive = async <T>(gate: AsyncGate, task: () => Promise<T>): Promise<T> => {
  const prev = gate.pending
  let release: (() => void) | undefined
  gate.pending = new Promise<void>((resolve) => {
    release = resolve
  })

  if (prev) {
    await prev
  }

  try {
    return await task()
  } finally {
    release?.()
  }
}

const createEmptyPreparedData = (): MatrixData => ({
  fields: [],
  stringTable: [""],
  sharedBlocks: [],
  sharedValues: [],
  branes: [],
  braneValues: [],
  braneSharedBlockRefs: [],
  stateTable: [],
  transitions: [],
  conditions: [],
  states: [],
  stateNames: [],
})

export const applyPreparedData = (prepared: MatrixData): void => {
  matrix$.fields = prepared.fields
  matrix$.stringTable = prepared.stringTable
  matrix$.sharedBlocks = prepared.sharedBlocks
  matrix$.sharedValues = prepared.sharedValues
  matrix$.branes = prepared.branes
  matrix$.braneValues = prepared.braneValues
  matrix$.braneSharedBlockRefs = prepared.braneSharedBlockRefs
  matrix$.stateTable = prepared.stateTable
  matrix$.transitions = prepared.transitions
  matrix$.conditions = prepared.conditions
  matrix$.states = prepared.states
  matrix$.stateNames = prepared.stateNames
}

const clearRuntimeAddressing = (): void => {
  gravity$.activeActorIds = []
  gravity$.actorIdToBraneIndex.clear()
  gravity$.braneIndexToActorId = []
  gravity$.wimpSrcByActorId.clear()
  gravity$.actorIdsByWimpSrc.clear()
  gravity$.structuralDirty = false
}

const clearRuntimeState = (): void => {
  pendingProcessExecutionsByActorId.clear()
  applyPreparedData(createEmptyPreparedData())
  clearRuntimeAddressing()
  strong$.reset()
  weak$.reset()
}

const parseActorIdPath = (path: Particle["path"]): number | null =>
  typeof path === "number" && Number.isSafeInteger(path) && path > 0 ? path : null

const isTopologyCompatibleActorField = (actorId: number, fieldId: number, runtimeFieldIndex: number): boolean => {
  if (strong$.topologyActorFieldIds.has(actorFieldKey(actorId, fieldId))) return true
  const field = matrix$.fields[runtimeFieldIndex]
  return field?.enum !== undefined || field?.type === FieldType.ARRAY_PTR
}

const defaultRuntimeFieldValue = (field: MatrixFieldRecord): unknown => {
  if (field.enum !== undefined) return null
  if (field.type === FieldType.ARRAY_PTR) return []
  if (field.type === FieldType.STRING_PTR) return null
  if (field.type === FieldType.BOOL) return false
  return 0
}

const collectActorFieldUpdates = (
  parts: Particle[],
  kind: "gluon" | "higgs",
): Array<[braneIndex: number, fieldUpdates: Array<[fieldIndex: number, value: unknown]>]> => {
  const groupedUpdates = new Map<number, Array<[number, unknown]>>()

  for (const part of parts) {
    if (part.part !== kind || (part.op !== "replace" && part.op !== "remove")) continue
    const actorId = parseActorIdPath(part.path)
    if (actorId === null) continue
    const braneIndex = gravity$.getBraneIndexByActorId(actorId)
    if (braneIndex === undefined) continue
    const fields = resolveForceFieldsPayload(part.value)
    if (fields === null) continue

    for (const [address, value] of Object.entries(fields)) {
      const fieldId = resolveForceFieldId(address)
      if (fieldId === null) continue
      const runtimeFieldIndex = strong$.runtimeFieldIndexByActorFieldId.get(actorFieldKey(actorId, fieldId))
      if (runtimeFieldIndex === undefined) continue
      const field = matrix$.fields[runtimeFieldIndex]
      if (!field) continue
      const isTopology = isTopologyCompatibleActorField(actorId, fieldId, runtimeFieldIndex)
      if (kind === "gluon" && isTopology) continue
      if (kind === "higgs" && !isTopology) continue

      const fieldUpdates = groupedUpdates.get(braneIndex)
      const nextValue = part.op === "remove" ? defaultRuntimeFieldValue(field) : value
      if (fieldUpdates) fieldUpdates.push([runtimeFieldIndex, nextValue])
      else groupedUpdates.set(braneIndex, [[runtimeFieldIndex, nextValue]])
    }
  }

  return Array.from(groupedUpdates, ([braneIndex, fieldUpdates]) => [braneIndex, fieldUpdates])
}

const markHiggsClassScopeDirty = (parts: Particle[]): void => {
  for (const part of parts) {
    if (part.part !== "higgs" || (part.op !== "replace" && part.op !== "remove")) continue
    if (typeof part.path !== "string") continue
    const fields = resolveForceFieldsPayload(part.value)
    if (fields === null) continue
    if (!Object.keys(fields).some((address) => resolveForceFieldId(address) !== null)) continue
    if (gravity$.getActorIdsByWimpSrc(part.path).length === 0) continue
    gravity$.structuralDirty = true
  }
}

const applyRuntimeFieldParts = async (
  parts: Particle[],
  kind: "gluon" | "higgs",
): Promise<[number, number][]> => {
  if (kind === "higgs") markHiggsClassScopeDirty(parts)
  const updates = collectActorFieldUpdates(parts, kind)
  if (updates.length === 0) return []
  return await update(updates)
}

const publishPhotonChanges = (changes: [number, number][]): void => {
  if (changes.length === 0) return
  const parts: Particle[] = []

  for (const [braneIndex, stateIndex] of changes) {
    const actorId = gravity$.getActorId(braneIndex)
    if (actorId === undefined) continue

    const stateName = matrix$.getStateName(braneIndex, stateIndex)
    if (!stateName) continue

    parts.push({
      part: "photon",
      op: weak$.stateHasProcessByBraneIndex[braneIndex]?.[stateIndex] === true ? "test" : "replace",
      path: actorId,
      value: stateName,
    })
  }

  if (parts.length === 0) return
  force.postMessage({parts})
}

const collectProcessExecutionFields = (actorId: number, braneIndex: number): Record<string, unknown> => {
  const fields: Record<string, unknown> = {}

  for (let runtimeFieldIndex = 0; runtimeFieldIndex < strong$.actorFieldIdsByRuntimeFieldIndex.length; runtimeFieldIndex++) {
    for (const [fieldActorId, fieldId] of strong$.actorFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] ?? []) {
      if (fieldActorId !== actorId) continue
      const value = matrix$.getFieldValue(braneIndex, runtimeFieldIndex)
      if (value !== undefined) fields[String(fieldId)] = value
    }
  }

  return fields
}

const cloneProcessExecutionFields = (fields: Record<string, unknown>): Record<string, unknown> =>
  structuredClone(fields) as Record<string, unknown>

const rememberPendingProcessExecution = (braneIndex: number, stateIndex: number): void => {
  const actorId = gravity$.getActorId(braneIndex)
  if (actorId === undefined) return
  pendingProcessExecutionsByActorId.set(actorId, {
    braneIndex,
    stateIndex,
    fields: cloneProcessExecutionFields(collectProcessExecutionFields(actorId, braneIndex)),
  })
}

const clearPendingProcessExecution = (braneIndex: number): void => {
  const actorId = gravity$.getActorId(braneIndex)
  if (actorId !== undefined) pendingProcessExecutionsByActorId.delete(actorId)
}

const syncProcessLocksForChanges = (changes: [number, number][], stateChanges: [number, number][]): void => {
  const weakUpdates: Array<{ kind: "lock"; braneIndex: number; value: boolean }> = []
  const stateChangeKeys = new Set(stateChanges.map(([braneIndex, stateIndex]) => `${braneIndex}\0${stateIndex}`))

  for (const [braneIndex, stateIndex] of changes) {
    const shouldLock = weak$.stateHasProcessByBraneIndex[braneIndex]?.[stateIndex] === true
    const brane = matrix$.branes[braneIndex]
    if (!brane) continue

    const isStateChange = stateChangeKeys.has(`${braneIndex}\0${stateIndex}`)
    if (isStateChange) {
      brane.lock = shouldLock
      weakUpdates.push({ kind: "lock", braneIndex, value: shouldLock })
    } else {
      if (brane.lock === shouldLock) continue
      brane.lock = shouldLock
      weakUpdates.push({ kind: "lock", braneIndex, value: shouldLock })
    }

    if (shouldLock) {
      rememberPendingProcessExecution(braneIndex, stateIndex)
    } else {
      clearPendingProcessExecution(braneIndex)
    }
  }

  if (weakUpdates.length > 0) {
    weakHeapUpdate(weakUpdates)
  }
}

const currentBraneHasProcess = (braneIndex: number): boolean => {
  const stateIndex = matrix$.states[braneIndex]
  return stateIndex !== undefined && weak$.stateHasProcessByBraneIndex[braneIndex]?.[stateIndex] === true
}

const applyEnergyExecutionRequest = (part: Particle): void => {
  if (part.part !== "z" || part.op !== "test") return
  const actorId = parseActorIdPath(part.path)
  if (actorId === null) return
  const braneIndex = gravity$.getBraneIndexByActorId(actorId)
  if (braneIndex === undefined) return
  const brane = matrix$.branes[braneIndex]
  if (!brane?.lock) return

  const stateIndex = matrix$.states[braneIndex]
  if (stateIndex === undefined) return
  if (!currentBraneHasProcess(braneIndex)) return

  const pending = pendingProcessExecutionsByActorId.get(actorId)
  if (
    !pending ||
    pending.braneIndex !== braneIndex ||
    pending.stateIndex !== stateIndex ||
    pending.acceptedEnergy !== undefined
  ) {
    return
  }
  if (!isRecord(part.value)) return
  const requestedEnergy = part.value.energy
  if (typeof requestedEnergy !== "string" || requestedEnergy.trim().length === 0) return
  const energy = requestedEnergy.trim()

  pending.acceptedEnergy = energy
  force.postMessage({
    parts: [{
      part: "z",
      op: "copy",
      path: actorId,
      from: energy,
      value: {fields: cloneProcessExecutionFields(pending.fields)},
    }],
  })
}

const collectActorWeakFieldUpdates = (
  actorId: number,
  fields: Record<string, unknown>,
): Array<[fieldIndex: number, value: unknown]> => {
  const fieldUpdates: Array<[fieldIndex: number, value: unknown]> = []

  for (const [address, value] of Object.entries(fields)) {
    const fieldId = resolveForceFieldId(address)
    if (fieldId === null) continue
    const runtimeFieldIndex = strong$.runtimeFieldIndexByActorFieldId.get(actorFieldKey(actorId, fieldId))
    if (runtimeFieldIndex === undefined) continue
    if (!matrix$.fields[runtimeFieldIndex]) continue
    fieldUpdates.push([runtimeFieldIndex, value])
  }

  return fieldUpdates
}

const applyActorWeakResult = async (part: Particle): Promise<boolean> => {
  if ((part.part !== "w+" && part.part !== "w-") || part.op !== "replace") return false
  const actorId = parseActorIdPath(part.path)
  if (actorId === null) return false
  const braneIndex = gravity$.getBraneIndexByActorId(actorId)
  if (braneIndex === undefined) return true
  const brane = matrix$.branes[braneIndex]
  if (!brane?.lock) return true
  if (!currentBraneHasProcess(braneIndex)) return true

  const pending = pendingProcessExecutionsByActorId.get(actorId)
  if (!pending?.acceptedEnergy) return true
  if (!isRecord(part.value)) return true
  if (part.part === "w-" && part.value.error !== undefined && typeof part.value.error !== "string") return true

  const fields = part.value.fields
  if (fields !== undefined && !isRecord(fields)) return true

  pendingProcessExecutionsByActorId.delete(actorId)
  await update([[braneIndex, collectActorWeakFieldUpdates(actorId, fields ?? {}), false]], {
    skipProcessRetriggerBraneIndexes: [braneIndex],
  })
  return true
}

export function prepareData(data: MatrixInputData): MatrixData {
  return assembleStoredMatrixData(flattenMatrixData(data))
}

export function listMatrixRuntimeActorIds(): number[] {
  return [...gravity$.activeActorIds]
}

export async function loadMatrixRuntimeSnapshot(snapshot: MatrixRuntimeSnapshot): Promise<void> {
  pendingProcessExecutionsByActorId.clear()
  weak$.reset()
  const prepared = assembleStoredMatrixData(flattenMatrixData(snapshot.data))
  applyPreparedData(prepared)

  if (prepared.fields.length > 0 || prepared.branes.length > 0) {
    await weakInit(matrix$)
  } else {
    weak$.reset()
  }

  gravity$.activeActorIds = [...snapshot.runtime.actorIdByBraneIndex]
  gravity$.braneIndexToActorId = [...snapshot.runtime.actorIdByBraneIndex]
  gravity$.actorIdToBraneIndex = new Map(snapshot.runtime.braneIndexByActorId)
  gravity$.wimpSrcByActorId = new Map(snapshot.runtime.wimpSrcByActorId)
  gravity$.actorIdsByWimpSrc = new Map(
    snapshot.runtime.actorIdsByWimpSrc.map(([wimpSrc, actorIds]) => [wimpSrc, [...actorIds]] as const),
  )
  gravity$.structuralDirty = false

  strong$.runtimeFieldIndexByWimpFieldId = new Map(snapshot.strong.runtimeFieldIndexByWimpFieldId)
  strong$.wimpFieldIdsByRuntimeFieldIndex = snapshot.strong.wimpFieldIdsByRuntimeFieldIndex.map((ids) => [...ids])
  strong$.braneIndexByWimpFieldId = new Map(snapshot.strong.braneIndexByWimpFieldId)
  strong$.topologyWimpFieldIds = new Set(snapshot.strong.topologyWimpFieldIds)
  strong$.runtimeFieldIndexByActorFieldId = new Map(
    snapshot.runtime.runtimeFieldIndexByActorFieldId.map(([actorId, fieldId, runtimeFieldIndex]) => [
      actorFieldKey(actorId, fieldId),
      runtimeFieldIndex,
    ] as const),
  )
  strong$.actorFieldIdsByRuntimeFieldIndex = []
  for (const [actorId, fieldId, runtimeFieldIndex] of snapshot.runtime.runtimeFieldIndexByActorFieldId) {
    const bucket = strong$.actorFieldIdsByRuntimeFieldIndex[runtimeFieldIndex]
    if (bucket) bucket.push([actorId, fieldId])
    else strong$.actorFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] = [[actorId, fieldId]]
  }
  strong$.topologyActorFieldIds = new Set(
    snapshot.strong.topologyActorFieldIds.map(([actorId, fieldId]) => actorFieldKey(actorId, fieldId)),
  )

  weak$.stateMetaStateIdsByBraneIndex = snapshot.weak.stateMetaStateIdsByBraneIndex.map((ids) => [...ids])
  weak$.stateHasProcessByBraneIndex = snapshot.weak.stateHasProcessByBraneIndex.map((items) => [...items])

  if (weak$.initialized) {
    const changes = await weakRunStep(StepMode.UndefinedOnly)
    syncProcessLocksForChanges(changes, changes)
    publishPhotonChanges(changes)
  }
}

type MatrixUpdateOptions = {
  retriggerProcessStates?: boolean
  skipProcessRetriggerBraneIndexes?: Iterable<number>
}

const collectProcessStateRetriggers = (
  updatedBraneIndexes: Iterable<number>,
  changes: [number, number][],
  skipBraneIndexes: Iterable<number> = [],
): [number, number][] => {
  const changedBraneIndexes = new Set(changes.map(([braneIndex]) => braneIndex))
  const skippedBraneIndexes = new Set(skipBraneIndexes)
  const retriggers: [number, number][] = []

  for (const braneIndex of updatedBraneIndexes) {
    if (changedBraneIndexes.has(braneIndex)) continue
    if (skippedBraneIndexes.has(braneIndex)) continue

    const stateIndex = matrix$.states[braneIndex]
    if (stateIndex === undefined) continue
    if (weak$.stateHasProcessByBraneIndex[braneIndex]?.[stateIndex] !== true) continue

    retriggers.push([braneIndex, stateIndex])
  }

  return retriggers
}

async function writePreparedData(prepared: MatrixData): Promise<[number, number][]> {
  return await runExclusive(writeGate, async () => {
    weak$.reset()
    applyPreparedData(prepared)

    if (!prepared.fields.length && !prepared.branes.length) {
      return []
    }

    await weakInit(matrix$)
    return []
  })
}

export async function write(data: MatrixInputData): Promise<[number, number][]> {
  validateData(data)
  /**
   * `write(data)` остаётся отдельным bootstrap/bypass path и не порождает id-composition.
   * Для такого режима `gravity$` очищается, а materialized runtime пишется напрямую.
   */
  clearRuntimeState()
  return await writePreparedData(assembleStoredMatrixData(flattenMatrixData(data)))
}

function requireInitializedStore(store$: MatrixStore): void {
  if (!store$.fields.length && !store$.branes.length) {
    throw new Error("Store not initialized. Call write() first.")
  }
}

function findMutableFieldRecord(
  store$: MatrixStore,
  braneIndex: number,
  fieldIndex: number,
): MatrixFieldValueRecord {
  if (!store$.branes[braneIndex]) {
    throw new Error(`Brane index out of range: ${braneIndex}`)
  }

  const fieldRecord = store$.getField(braneIndex, fieldIndex)
  if (fieldRecord) {
    return fieldRecord
  }

  throw new Error(`Field ${fieldIndex} not found in brane ${braneIndex}`)
}

export async function update(
  updates: Array<[braneIndex: number, fieldUpdates: Array<[fieldIndex: number, value: unknown]>, lock?: boolean]>,
  options: MatrixUpdateOptions = {},
): Promise<[number, number][]> {
  return await runExclusive(updateGate, async () => {
    requireInitializedStore(matrix$)
    const stringInterner = createStoredStringInterner(matrix$.stringTable)
    const weakUpdates: Array<
      { kind: "field"; braneIndex: number; fieldIndex: number } | { kind: "lock"; braneIndex: number; value: boolean }
    > = []
    const affectedBraneIndexes = new Set<number>()

    for (const [braneIndex, fieldUpdates, lock] of updates) {
      const brane = matrix$.branes[braneIndex]
      if (!brane) {
        throw new Error(`Brane index out of range: ${braneIndex}`)
      }

      if (lock !== undefined) {
        brane.lock = lock
        weakUpdates.push({ kind: "lock", braneIndex, value: lock })
      }

      for (const [fieldIndex, value] of fieldUpdates) {
        const field = matrix$.fields[fieldIndex]
        if (!field) {
          throw new Error(`Field ${fieldIndex} not defined`)
        }
        const record = findMutableFieldRecord(matrix$, braneIndex, fieldIndex)
        record.value = normalizeFieldValue(value, field, stringInterner)
        weakUpdates.push({ kind: "field", braneIndex, fieldIndex })
        affectedBraneIndexes.add(braneIndex)

        // Runtime field may be shared across multiple id-addressed fields via source/entanglement.
        for (const [actorId] of strong$.actorFieldIdsByRuntimeFieldIndex[fieldIndex] ?? []) {
          const affectedBraneIndex = gravity$.getBraneIndexByActorId(actorId)
          if (affectedBraneIndex !== undefined) {
            affectedBraneIndexes.add(affectedBraneIndex)
          }
        }
        for (const wimpFieldId of strong$.wimpFieldIdsByRuntimeFieldIndex[fieldIndex] ?? []) {
          const affectedBraneIndex = strong$.braneIndexByWimpFieldId.get(wimpFieldId)
          if (affectedBraneIndex !== undefined) {
            affectedBraneIndexes.add(affectedBraneIndex)
          }
        }
      }
    }

    weakHeapUpdate(weakUpdates)
    const changes = await weakRunStep()
    const photonTargets =
      options.retriggerProcessStates === false
        ? changes
        : [
            ...changes,
            ...collectProcessStateRetriggers(
              affectedBraneIndexes,
              changes,
              options.skipProcessRetriggerBraneIndexes,
            ),
          ]

    syncProcessLocksForChanges(photonTargets, changes)
    publishPhotonChanges(photonTargets)
    return changes
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function unlock(indexes: number[]): void {
  requireInitializedStore(matrix$)
  const weakUpdates: Array<{ kind: "lock"; braneIndex: number; value: boolean }> = []

  for (const index of indexes) {
    const brane = matrix$.branes[index]
    if (!brane) {
      throw new Error(`Brane at index ${index} not found in matrix`)
    }
    clearPendingProcessExecution(index)
    brane.lock = false
    weakUpdates.push({ kind: "lock", braneIndex: index, value: false })
  }

  weakHeapUpdate(weakUpdates)
}

export { FieldType } from "./gravity"
export { gravity$ }
export { matrix$ }
export { strong$ }
export { flattenMatrixData } from "./gravity"
