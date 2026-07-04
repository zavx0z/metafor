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
import type { MatrixFieldRecord, MatrixFieldValueRecord, MatrixStore } from "./store.t"
import type { PreparedData } from "./matrix.t"
import { FieldType, flattenMatrixData, validateData, type Data } from "@matrix/gravity"
import { createStoredStringInterner, normalizeFieldValue, assembleStoredMatrixData, strong$ } from "@matrix/strong"
import { StepMode, weakHeapUpdate, weakInit, weakRunStep, weak$ } from "@matrix/weak"
import {resolveForceFieldId, resolveForceFieldsPayload} from "../boundary/force-fields.ts"
import type {ProcessTask} from "boundary"

export type MatrixDomainPath = string | number

export type MatrixParticle = {
  part: string
  op: string
  path: MatrixDomainPath
  value?: unknown
  from?: MatrixDomainPath
  [key: string]: unknown
}

export type MatrixForceMessage = {
  parts: MatrixParticle[]
}

export const force = new BroadcastChannel("force")

force.onmessage = async (event) => {
  for (const part of (event.data as MatrixForceMessage).parts) {
    switch (part.part) {
      case "gluon":
        await applyRuntimeFieldParts([part], "gluon")
        break
      case "higgs":
        await applyRuntimeFieldParts([part], "higgs")
        break
      case "w+":
      case "w-":
        for (const packet of collectWeakResultPackets([part])) {
          await applyWeakResultPacket(packet)
        }
        break
    }
  }
}

type MatrixValuePart = { op: "replace"; path: string; value: unknown }
type MatrixWeakResultPayload = { wimpId: number; processId: number; parts: MatrixValuePart[] }

export type MatrixRuntimeSnapshot = {
  ok: true
  version: 1
  /** @deprecated Actor IDs kept only for legacy process result addressing. */
  wimpIds: number[]
  /** Actor IDs kept only for legacy process result addressing. */
  legacyProcessActorIds?: number[]
  runtime: {
    actorIdByBraneIndex: number[]
    braneIndexByActorId: Array<[actorId: number, braneIndex: number]>
    wimpSrcByActorId: Array<[actorId: number, wimpSrc: string]>
    actorIdsByWimpSrc: Array<[wimpSrc: string, actorIds: number[]]>
    runtimeFieldIndexByActorFieldId: Array<[actorId: number, fieldId: number, runtimeFieldIndex: number]>
  }
  data: Data
  strong: {
    runtimeFieldIndexByWimpFieldId: Array<[number, number]>
    wimpFieldIdsByRuntimeFieldIndex: number[][]
    braneIndexByWimpFieldId: Array<[number, number]>
    topologyWimpFieldIds: number[]
    topologyActorFieldIds: Array<[actorId: number, fieldId: number]>
  }
  weak: {
    stateMetaStateIdsByBraneIndex: number[][]
    stateProcessIdsByBraneIndex: Array<Array<number | null | undefined>>
  }
}

export type MatrixProcessTask = ProcessTask

export interface MatrixProcessTaskSubscription {
  close(): void
}

type AsyncGate = {
  pending: null | Promise<void>
}

const writeGate: AsyncGate = { pending: null }
const updateGate: AsyncGate = { pending: null }
const WEAK_RESULT_FIELD_PART_PATH_PREFIX = "/field/"
const processTaskListeners = new Set<(task: MatrixProcessTask) => void>()
let processTaskSequence = 0

const actorFieldKey = (actorId: number, fieldId: number): string =>
  `${actorId}\0${fieldId}`

const parseRuntimeId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

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

const createEmptyPreparedData = (): PreparedData => ({
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

export const applyPreparedData = (prepared: PreparedData): void => {
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
  gravity$.activeWimpIds = []
  gravity$.activeActorIds = []
  gravity$.wimpIdToBraneIndex.clear()
  gravity$.actorIdToBraneIndex.clear()
  gravity$.braneIndexToWimpId = []
  gravity$.braneIndexToActorId = []
  gravity$.wimpSrcByActorId.clear()
  gravity$.actorIdsByWimpSrc.clear()
  gravity$.structuralDirty = false
}

const clearRuntimeState = (): void => {
  applyPreparedData(createEmptyPreparedData())
  clearRuntimeAddressing()
  strong$.reset()
  weak$.reset()
}

const requireRuntimeFieldAddress = (wimpFieldId: number): [braneIndex: number, runtimeFieldIndex: number] => {
  const braneIndex = strong$.braneIndexByWimpFieldId.get(wimpFieldId)
  const runtimeFieldIndex = strong$.runtimeFieldIndexByWimpFieldId.get(wimpFieldId)

  if (braneIndex === undefined) {
    throw new Error(`Matrix id field is not materialized in current runtime: ${wimpFieldId}`)
  }
  if (runtimeFieldIndex === undefined) {
    throw new Error(`Matrix runtime field index is missing for id field: ${wimpFieldId}`)
  }

  return [braneIndex, runtimeFieldIndex]
}

const parseActorIdPath = (path: MatrixParticle["path"]): number | null =>
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
  parts: MatrixParticle[],
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

const markHiggsClassScopeDirty = (parts: MatrixParticle[]): void => {
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
  parts: MatrixParticle[],
  kind: "gluon" | "higgs",
): Promise<[number, number][]> => {
  if (kind === "higgs") markHiggsClassScopeDirty(parts)
  const updates = collectActorFieldUpdates(parts, kind)
  if (updates.length === 0) return []
  return await update(updates)
}

const publishPhotonChanges = (changes: [number, number][]): void => {
  if (changes.length === 0) return
  const parts: MatrixParticle[] = []

  for (const [braneIndex, stateIndex] of changes) {
    const actorId = gravity$.getActorId(braneIndex)
    if (actorId === undefined) continue

    const stateName = matrix$.getStateName(braneIndex, stateIndex)
    if (!stateName) continue

    parts.push({ part: "photon", op: "replace", path: actorId, value: stateName })
  }

  if (parts.length === 0) return
  force.postMessage({parts})
}

const processTaskToken = (actorId: number, processId: number): string =>
  `${actorId}:${processId}:${Date.now()}:${++processTaskSequence}`

const publishProcessTask = (task: MatrixProcessTask): void => {
  force.postMessage({
    parts: [{
      part: "z",
      op: "test",
      path: task.actorId,
      processId: task.processId,
      token: task.token,
      value: {
        kind: "process-task",
        state: task.state,
        ...(task.env !== undefined ? {env: task.env} : {}),
        ...(task.mass !== undefined ? {mass: task.mass} : {}),
        ...(task.fields !== undefined ? {fields: task.fields} : {}),
      },
    }],
  })
}

const collectProcessTaskFields = (actorId: number, braneIndex: number): Record<string, unknown> => {
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

const createProcessTask = (braneIndex: number, stateIndex: number, processId: number): MatrixProcessTask | null => {
  const actorId = gravity$.getActorId(braneIndex)
  if (actorId === undefined) return null
  const stateName = matrix$.getStateName(braneIndex, stateIndex)

  return {
    actorId,
    state: stateName ?? stateIndex,
    processId,
    token: processTaskToken(actorId, processId),
    mass: {actorId},
    fields: collectProcessTaskFields(actorId, braneIndex),
  }
}

const emitProcessTask = (task: MatrixProcessTask): void => {
  publishProcessTask(task)
  for (const listener of processTaskListeners) listener(task)
}

const syncProcessLocksForChanges = (changes: [number, number][], stateChanges: [number, number][]): void => {
  const weakUpdates: Array<{ kind: "lock"; braneIndex: number; value: boolean }> = []
  const processTasks: MatrixProcessTask[] = []
  const stateChangeKeys = new Set(stateChanges.map(([braneIndex, stateIndex]) => `${braneIndex}\0${stateIndex}`))

  for (const [braneIndex, stateIndex] of changes) {
    const processId = weak$.stateProcessIdsByBraneIndex[braneIndex]?.[stateIndex]
    const shouldLock = processId !== undefined && processId !== null
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
      const task = createProcessTask(braneIndex, stateIndex, processId)
      if (task !== null) processTasks.push(task)
    }
  }

  if (weakUpdates.length > 0) {
    weakHeapUpdate(weakUpdates)
  }
  for (const task of processTasks) emitProcessTask(task)
}

const requireWeakResultFieldPartId = (path: string): number => {
  if (!path.startsWith(WEAK_RESULT_FIELD_PART_PATH_PREFIX)) {
    throw new Error(`Unsupported Matrix weak result field part path: ${path}`)
  }

  const wimpFieldId = parseRuntimeId(path.slice(WEAK_RESULT_FIELD_PART_PATH_PREFIX.length))
  if (wimpFieldId === null) {
    throw new Error(`Matrix weak result field part path is missing field id: ${path}`)
  }

  return wimpFieldId
}

const getCurrentBraneProcessId = (braneIndex: number): number | undefined => {
  const stateIndex = matrix$.states[braneIndex]
  if (stateIndex === undefined) return undefined
  return weak$.stateProcessIdsByBraneIndex[braneIndex]?.[stateIndex]
}

export function prepareData(data: Data): PreparedData {
  return assembleStoredMatrixData(flattenMatrixData(data))
}

export function listMatrixRuntimeActorIds(): number[] {
  return [...gravity$.activeActorIds]
}

export async function loadMatrixRuntimeSnapshot(snapshot: MatrixRuntimeSnapshot): Promise<void> {
  weak$.reset()
  const prepared = assembleStoredMatrixData(flattenMatrixData(snapshot.data))
  applyPreparedData(prepared)

  if (prepared.fields.length > 0 || prepared.branes.length > 0) {
    await weakInit(matrix$)
  } else {
    weak$.reset()
  }

  const legacyProcessActorIds = snapshot.legacyProcessActorIds ?? snapshot.wimpIds
  gravity$.activeWimpIds = [...legacyProcessActorIds]
  gravity$.braneIndexToWimpId = [...legacyProcessActorIds]
  gravity$.wimpIdToBraneIndex = new Map(
    legacyProcessActorIds.map((actorId, braneIndex) => [actorId, braneIndex] as const),
  )
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
  weak$.stateProcessIdsByBraneIndex = snapshot.weak.stateProcessIdsByBraneIndex.map((ids) =>
    ids.map((id) => id ?? undefined),
  )

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
    if (weak$.stateProcessIdsByBraneIndex[braneIndex]?.[stateIndex] === undefined) continue

    retriggers.push([braneIndex, stateIndex])
  }

  return retriggers
}

async function writePreparedData(prepared: PreparedData): Promise<[number, number][]> {
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

export async function write(data: Data): Promise<[number, number][]> {
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

export async function applyWeakResultPacket(message: MatrixWeakResultPayload): Promise<[number, number][]> {
  requireInitializedStore(matrix$)

  const braneIndex = gravity$.getBraneIndex(message.wimpId)
  if (braneIndex === undefined) {
    throw new Error(`Matrix weak result targets non-materialized wimp: ${message.wimpId}`)
  }

  const brane = matrix$.branes[braneIndex]
  if (!brane) {
    throw new Error(`Matrix weak result targets missing brane: ${braneIndex}`)
  }
  if (!brane.lock) {
    throw new Error(`Matrix weak result requires locked brane for wimp ${message.wimpId}`)
  }

  const activeProcessId = getCurrentBraneProcessId(braneIndex)
  if (!activeProcessId) {
    throw new Error(`Matrix weak result requires process-bound state for wimp ${message.wimpId}`)
  }
  if (activeProcessId !== message.processId) {
    throw new Error(
      `Matrix weak result process mismatch for wimp ${message.wimpId}: expected ${activeProcessId}, got ${message.processId}`,
    )
  }

  const fieldUpdates: Array<[fieldIndex: number, value: unknown]> = []

  for (const part of message.parts) {
    const wimpFieldId = requireWeakResultFieldPartId(part.path)
    const [ownerBraneIndex, runtimeFieldIndex] = requireRuntimeFieldAddress(wimpFieldId)
    if (ownerBraneIndex === undefined) {
      throw new Error(`Matrix weak result field is not materialized: ${wimpFieldId}`)
    }
    if (ownerBraneIndex !== braneIndex) {
      throw new Error(
        `Matrix weak result field ${wimpFieldId} belongs to brane ${ownerBraneIndex}, expected ${braneIndex}`,
      )
    }
    fieldUpdates.push([runtimeFieldIndex, part.value])
  }

  return await update([[braneIndex, fieldUpdates, false]], {
    skipProcessRetriggerBraneIndexes: [braneIndex],
  })
}

const collectWeakResultPackets = (parts: MatrixParticle[]): MatrixWeakResultPayload[] => {
  const packets = new Map<string, MatrixWeakResultPayload>()

  for (const part of parts) {
    if (part.part !== "w+" && part.part !== "w-") continue
    if (part.op !== "replace" && !isWeakResultMarker(part)) continue
    const wimpId = parseRuntimeId(part.wimpId)
    const processId = parseRuntimeId(part.processId)
    if (wimpId === null || processId === null) continue

    const key = `${wimpId}\0${processId}`
    let packet = packets.get(key)
    if (!packet) {
      packet = { wimpId, processId, parts: [] }
      packets.set(key, packet)
    }
    if (part.op === "replace") {
      if (typeof part.path !== "string") continue
      packet.parts.push({ op: "replace", path: part.path, value: part.value })
    }
  }

  return [...packets.values()]
}

const isWeakResultMarker = (part: MatrixParticle): boolean =>
  part.op === "test" && (part.kind === "result" || (isRecord(part.value) && part.value.kind === "result"))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function subscribeMatrixProcessTasks(
  listener: (task: MatrixProcessTask) => void,
): MatrixProcessTaskSubscription {
  processTaskListeners.add(listener)
  return {
    close() {
      processTaskListeners.delete(listener)
    },
  }
}

export function unlock(indexes: number[]): void {
  requireInitializedStore(matrix$)
  const weakUpdates: Array<{ kind: "lock"; braneIndex: number; value: boolean }> = []

  for (const index of indexes) {
    const brane = matrix$.branes[index]
    if (!brane) {
      throw new Error(`Brane at index ${index} not found in matrix`)
    }
    brane.lock = false
    weakUpdates.push({ kind: "lock", braneIndex: index, value: false })
  }

  weakHeapUpdate(weakUpdates)
}

export type { PreparedData } from "./matrix.t"
export type { MatrixGravityStore } from "./gravity/store.t"
export { FieldType } from "./gravity"
export { gravity$ }
export { matrix$ }
export { strong$ }
export { flattenMatrixData } from "./gravity"
