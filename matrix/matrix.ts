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
 * - `force` — доменная Force-связь и dispatch в Matrix pipeline
 * - `unlock()` — снятие блокировки с бран
 *
 * ## Архитектура
 *
 * Matrix раскладывает уже подготовленную matrix-форму через
 * `@matrix/gravity`, собирает канонический store через `@matrix/strong`
 * и оркестрирует вычисление перехода через `@matrix/weak`.
 *
 * Matrix наращивает локальную actor/declaration projection отдельными
 * particles. Persistent DB принадлежит Boundary; Matrix не читает её и не
 * сбрасывает runtime при cold start или reconnect.
 *
 * Matrix НЕ содержит:
 * - source graph loading и primary addressing — это `dark`
 * - раскладку структуры и проверку входа — это `@matrix/gravity`
 * - канонизацию и сборку store-формы — это `@matrix/strong`
 * - вычисление перехода и backend-адаптеры — это `@matrix/weak`
 */

import { gravity$ } from "@matrix/gravity/store.ts"
import { matrix$ } from "./store"
import type { MatrixData, MatrixFieldValueRecord, MatrixStore } from "@metafor/types/matrix/store"
import type { MatrixFieldRecord, MatrixInputData } from "@metafor/types/matrix/data"
import type { AsyncGate, MatrixPendingProcessExecution, MatrixUpdateOptions } from "@metafor/types/matrix/runtime"
import { FieldType, flattenMatrixData, validateData } from "@matrix/gravity"
import { createStoredStringInterner, normalizeFieldValue, assembleStoredMatrixData, strong$ } from "@matrix/strong"
import { StepMode, weakHeapUpdate, weakInit, weakRunStep, weak$ } from "@matrix/weak"
import {resolveForceFieldId, resolveForceFieldsPayload} from "@metafor/types/force/fields"
import type { Particle } from "@metafor/types/force/particle"
import {Force} from "force"
import {MatrixProjectionStore, type MatrixDeclarationRecord} from "./projection.ts"

const force = new Force("matrix")
export const matrixProjection$ = new MatrixProjectionStore()

type IncrementalPendingProcess = {
  state: string
  fields: Record<string, unknown>
  acceptedEnergy?: string
}

const incrementalPendingByActorId = new Map<number, IncrementalPendingProcess>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

const declarationId = (record: MatrixDeclarationRecord): number | null => numeric(record.id)

const stateRecords = (wimp: string): MatrixDeclarationRecord[] =>
  matrixProjection$.declaration(wimp, "states").sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))

const processForState = (wimp: string, state: string): MatrixDeclarationRecord | undefined =>
  matrixProjection$.declaration(wimp, "processes").find((process) => process.state === state || process.key === state)

const actorFields = (actorId: number): Record<string, unknown> =>
  Object.fromEntries([...(matrixProjection$.fieldValuesByActorId.get(actorId) ?? [])].map(([id, value]) => [String(id), structuredClone(value)]))

const publishIncrementalPhoton = (actorId: number, state: string): void => {
  const actor = matrixProjection$.actors.get(actorId)
  if (!actor) return
  const hasProcess = processForState(actor.actor.wimp, state) !== undefined
  if (hasProcess) incrementalPendingByActorId.set(actorId, {state, fields: actorFields(actorId)})
  else incrementalPendingByActorId.delete(actorId)
  force.impulse({parts: [{part: "photon", op: hasProcess ? "test" : "replace", path: actorId, value: state}]})
}

const comparePredicate = (actual: unknown, raw: unknown): boolean => {
  if (!isRecord(raw)) return Object.is(actual, raw)
  for (const [operator, expected] of Object.entries(raw)) {
    if (operator === "eq" && !Object.is(actual, expected)) return false
    if (operator === "neq" && Object.is(actual, expected)) return false
    if (operator === "gt" && !(Number(actual) > Number(expected))) return false
    if (operator === "gte" && !(Number(actual) >= Number(expected))) return false
    if (operator === "lt" && !(Number(actual) < Number(expected))) return false
    if (operator === "lte" && !(Number(actual) <= Number(expected))) return false
    if (operator === "in" && (!Array.isArray(expected) || !expected.some((item) => Object.is(item, actual)))) return false
    if (operator === "notIn" && Array.isArray(expected) && expected.some((item) => Object.is(item, actual))) return false
    if (operator === "include" && (!Array.isArray(actual) || !actual.some((item) => Object.is(item, expected)))) return false
    if (operator === "notInclude" && Array.isArray(actual) && actual.some((item) => Object.is(item, expected))) return false
    if (operator === "isEmpty" && ((Array.isArray(actual) || typeof actual === "string") ? actual.length === 0 : actual == null) !== Boolean(expected)) return false
    if (operator === "null" && (actual === null) !== Boolean(expected)) return false
    if (operator === "length") {
      const length = Array.isArray(actual) || typeof actual === "string" ? actual.length : 0
      if (!comparePredicate(length, expected)) return false
    }
  }
  return true
}

const conditionPredicate = (condition: MatrixDeclarationRecord): unknown =>
  condition.predicate ?? condition.predicates ?? condition.value

const evaluateIncrementalActor = (actorId: number, retriggerProcess = true): void => {
  const actor = matrixProjection$.actors.get(actorId)
  if (!actor) return
  const states = stateRecords(actor.actor.wimp)
  if (states.length === 0) return
  if (actor.state === null) {
    const first = states[0]?.name
    if (typeof first === "string") {
      matrixProjection$.setActorState(actorId, first)
      publishIncrementalPhoton(actorId, first)
    }
    return
  }

  const current = states.find((state) => state.name === actor.state)
  const currentId = current && declarationId(current)
  if (currentId === null) return
  const transitions = matrixProjection$.declaration(actor.actor.wimp, "transitions")
    .filter((transition) => transition.fromState === currentId || transition.from === currentId)
    .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
  const fields = matrixProjection$.fieldValuesByActorId.get(actorId) ?? new Map<number, unknown>()

  for (const transition of transitions) {
    const transitionId = declarationId(transition)
    if (transitionId === null) continue
    const conditions = matrixProjection$.declaration(actor.actor.wimp, "conditions")
      .filter((condition) => condition.transition === transitionId)
      .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
    const passed = conditions.every((condition) => {
      const fieldId = numeric(condition.field)
      return fieldId !== null && comparePredicate(fields.get(fieldId), conditionPredicate(condition))
    })
    if (!passed) continue
    const targetId = numeric(transition.toState ?? transition.to)
    const target = targetId === null ? undefined : states.find((state) => declarationId(state) === targetId)
    if (typeof target?.name !== "string" || target.name === actor.state) break
    matrixProjection$.setActorState(actorId, target.name)
    publishIncrementalPhoton(actorId, target.name)
    return
  }

  if (retriggerProcess && processForState(actor.actor.wimp, actor.state)) publishIncrementalPhoton(actorId, actor.state)
}

force.onImpulse = async (impulse) => {
  const part = impulse.parts[0]
  if (part.part === "graviton") {
    const change = matrixProjection$.apply(part)
    for (const actorId of change.affectedActorIds) evaluateIncrementalActor(actorId, false)
    return
  }
  if (part.part === "gluon" || part.part === "higgs") {
    const change = matrixProjection$.applyFields(part)
    for (const actorId of change.affectedActorIds) evaluateIncrementalActor(actorId)
    return
  }
  if (part.part === "photon") {
    const actorId = numeric(part.path)
    if (actorId !== null && (part.op === "add" || part.op === "replace") && typeof part.value === "string") {
      matrixProjection$.setActorState(actorId, part.value)
    }
    return
  }
  if (part.part === "z" && part.op === "test") {
    const actorId = numeric(part.path)
    const pending = actorId === null ? undefined : incrementalPendingByActorId.get(actorId)
    if (actorId === null || !pending || pending.acceptedEnergy !== undefined || !isRecord(part.value)) return
    const energy = typeof part.value.energy === "string" ? part.value.energy.trim() : ""
    if (!energy) return
    pending.acceptedEnergy = energy
    force.impulse({parts: [{part: "z", op: "copy", path: actorId, from: energy, value: {fields: structuredClone(pending.fields)}}]})
    return
  }
  if ((part.part === "w+" || part.part === "w-") && part.op === "replace") {
    const actorId = numeric(part.path)
    if (actorId === null || !incrementalPendingByActorId.has(actorId) || !isRecord(part.value)) return
    const fields = isRecord(part.value.fields) ? part.value.fields : {}
    matrixProjection$.applyFields({part: "gluon", op: "replace", path: actorId, value: {fields}})
    incrementalPendingByActorId.delete(actorId)
    evaluateIncrementalActor(actorId, false)
    return
  }
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

  for (const [braneIndex, stateIndex] of changes) {
    const actorId = gravity$.getActorId(braneIndex)
    if (actorId === undefined) continue

    const stateName = matrix$.getStateName(braneIndex, stateIndex)
    if (!stateName) continue

    force.impulse({parts: [{
      part: "photon",
      op: weak$.stateHasProcessByBraneIndex[braneIndex]?.[stateIndex] === true ? "test" : "replace",
      path: actorId,
      value: stateName,
    }]})
  }
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
  force.impulse({
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
    applyPreparedData(prepared)

    if (!prepared.fields.length && !prepared.branes.length) {
      return []
    }

    await weakInit(matrix$)
    return []
  })
}

export async function write(data: MatrixInputData): Promise<[number, number][]> {
  // Legacy standalone packed-data harness. The Force runtime never calls it.
  validateData(data)
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
