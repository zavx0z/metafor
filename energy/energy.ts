/**
 * energy — доменный оркестратор детерминированного перехода состояний.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * - `write()` — запись канонической energy-структуры в доменный store
 * - `gravity$` — runtime-адресация materialized branes
 * - `update()` — обновление полей и вычисление следующего перехода
 * - `applyWeakResultPacket()` / `subscribeEnergyWeakResultBroadcast()` — приём единого W-result envelope и unlock после apply
 * - `unlock()` — снятие блокировки с бран
 *
 * ## Архитектура
 *
 * Energy раскладывает уже подготовленную energy-форму через
 * `@energy/gravity`, собирает канонический store через `@energy/strong`
 * и оркестрирует вычисление перехода через `@energy/weak`.
 *
 * Energy работает с уже подготовленным runtime-снимком. Persistent Boundary DB
 * принадлежит Dark, а Energy держит только runtime-состояние процесса.
 *
 * Energy НЕ содержит:
 * - source graph loading и primary addressing — это `dark`
 * - раскладку структуры и проверку входа — это `@energy/gravity`
 * - канонизацию и сборку store-формы — это `@energy/strong`
 * - вычисление перехода и backend-адаптеры — это `@energy/weak`
 */

import { gravity$ } from "@energy/gravity/store.ts"
import { energy$ } from "./store"
import type { EnergyFieldRecord, EnergyFieldValueRecord, EnergyStore } from "./store.t"
import type { PreparedData } from "./energy.t"
import {force, type EnergyForceMessage, type EnergyParticle} from "./channel"
import { FieldType, flattenEnergyData, validateData, type Data } from "@energy/gravity"
import { createStoredStringInterner, normalizeFieldValue, assembleStoredEnergyData, strong$ } from "@energy/strong"
import { weakHeapUpdate, weakInit, weakRunStep, weak$ } from "@energy/weak"
import {resolveForceFieldId, resolveForceFieldsPayload} from "../boundary/force-fields.ts"

type EnergyValuePart = { op: "replace"; path: string; value: unknown }
type EnergyWeakResultPayload = { wimpId: number; processId: number; parts: EnergyValuePart[] }

export type EnergyRuntimeSnapshot = {
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

export interface EnergyBroadcastSubscription {
  close(): Promise<void>
}

export type EnergyValueBroadcastSubscription = EnergyBroadcastSubscription
export type EnergyWeakBroadcastSubscription = EnergyBroadcastSubscription

type AsyncGate = {
  pending: null | Promise<void>
}

const writeGate: AsyncGate = { pending: null }
const updateGate: AsyncGate = { pending: null }
const WEAK_RESULT_FIELD_PART_PATH_PREFIX = "/field/"

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

const createSubscription = (
  onMessage: (message: EnergyForceMessage) => Promise<void> | void,
): EnergyBroadcastSubscription => {
  const subscription = force.observe((event) => {
    void (async () => {
      await onMessage(event.data)
    })()
  })

  return {
    async close() {
      subscription.close()
    },
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
  energy$.fields = prepared.fields
  energy$.stringTable = prepared.stringTable
  energy$.sharedBlocks = prepared.sharedBlocks
  energy$.sharedValues = prepared.sharedValues
  energy$.branes = prepared.branes
  energy$.braneValues = prepared.braneValues
  energy$.braneSharedBlockRefs = prepared.braneSharedBlockRefs
  energy$.stateTable = prepared.stateTable
  energy$.transitions = prepared.transitions
  energy$.conditions = prepared.conditions
  energy$.states = prepared.states
  energy$.stateNames = prepared.stateNames
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
    throw new Error(`Energy id field is not materialized in current runtime: ${wimpFieldId}`)
  }
  if (runtimeFieldIndex === undefined) {
    throw new Error(`Energy runtime field index is missing for id field: ${wimpFieldId}`)
  }

  return [braneIndex, runtimeFieldIndex]
}

const parseActorIdPath = (path: EnergyParticle["path"]): number | null =>
  typeof path === "number" && Number.isSafeInteger(path) && path > 0 ? path : null

const isTopologyCompatibleActorField = (actorId: number, fieldId: number, runtimeFieldIndex: number): boolean => {
  if (strong$.topologyActorFieldIds.has(actorFieldKey(actorId, fieldId))) return true
  const field = energy$.fields[runtimeFieldIndex]
  return field?.enum !== undefined || field?.type === FieldType.ARRAY_PTR
}

const defaultRuntimeFieldValue = (field: EnergyFieldRecord): unknown => {
  if (field.enum !== undefined) return null
  if (field.type === FieldType.ARRAY_PTR) return []
  if (field.type === FieldType.STRING_PTR) return null
  if (field.type === FieldType.BOOL) return false
  return 0
}

const collectActorFieldUpdates = (
  parts: EnergyParticle[],
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
      const field = energy$.fields[runtimeFieldIndex]
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

const markHiggsClassScopeDirty = (parts: EnergyParticle[]): void => {
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
  parts: EnergyParticle[],
  kind: "gluon" | "higgs",
): Promise<[number, number][]> => {
  if (kind === "higgs") markHiggsClassScopeDirty(parts)
  const updates = collectActorFieldUpdates(parts, kind)
  if (updates.length === 0) return []
  return await update(updates)
}

const publishPhotonChanges = (changes: [number, number][]): void => {
  if (changes.length === 0) return
  const parts: EnergyParticle[] = []

  for (const [braneIndex, stateIndex] of changes) {
    const actorId = gravity$.getActorId(braneIndex)
    if (actorId === undefined) continue

    const stateName = energy$.getStateName(braneIndex, stateIndex)
    if (!stateName) continue

    parts.push({ part: "photon", op: "replace", path: actorId, value: stateName })
  }

  if (parts.length === 0) return
  force.emit({parts})
}

const syncProcessLocksForChanges = (changes: [number, number][]): void => {
  const weakUpdates: Array<{ kind: "lock"; braneIndex: number; value: boolean }> = []

  for (const [braneIndex, stateIndex] of changes) {
    const shouldLock = weak$.stateProcessIdsByBraneIndex[braneIndex]?.[stateIndex] !== undefined
    const brane = energy$.branes[braneIndex]
    if (!brane || brane.lock === shouldLock) continue

    brane.lock = shouldLock
    weakUpdates.push({ kind: "lock", braneIndex, value: shouldLock })
  }

  if (weakUpdates.length > 0) {
    weakHeapUpdate(weakUpdates)
  }
}

const requireWeakResultFieldPartId = (path: string): number => {
  if (!path.startsWith(WEAK_RESULT_FIELD_PART_PATH_PREFIX)) {
    throw new Error(`Unsupported Energy weak result field part path: ${path}`)
  }

  const wimpFieldId = parseRuntimeId(path.slice(WEAK_RESULT_FIELD_PART_PATH_PREFIX.length))
  if (wimpFieldId === null) {
    throw new Error(`Energy weak result field part path is missing field id: ${path}`)
  }

  return wimpFieldId
}

const getCurrentBraneProcessId = (braneIndex: number): number | undefined => {
  const stateIndex = energy$.states[braneIndex]
  if (stateIndex === undefined) return undefined
  return weak$.stateProcessIdsByBraneIndex[braneIndex]?.[stateIndex]
}

export function prepareData(data: Data): PreparedData {
  return assembleStoredEnergyData(flattenEnergyData(data))
}

export function listRuntimeActorIds(): number[] {
  return [...gravity$.activeActorIds]
}

export async function loadRuntimeSnapshot(snapshot: EnergyRuntimeSnapshot): Promise<void> {
  const prepared = assembleStoredEnergyData(flattenEnergyData(snapshot.data))
  applyPreparedData(prepared)

  if (prepared.fields.length > 0 || prepared.branes.length > 0) {
    await weakInit(energy$)
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
}

type EnergyUpdateOptions = {
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

    const stateIndex = energy$.states[braneIndex]
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

    await weakInit(energy$)
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
  return await writePreparedData(assembleStoredEnergyData(flattenEnergyData(data)))
}

function requireInitializedStore(store$: EnergyStore): void {
  if (!store$.fields.length && !store$.branes.length) {
    throw new Error("Store not initialized. Call write() first.")
  }
}

function findMutableFieldRecord(
  store$: EnergyStore,
  braneIndex: number,
  fieldIndex: number,
): EnergyFieldValueRecord {
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
  options: EnergyUpdateOptions = {},
): Promise<[number, number][]> {
  return await runExclusive(updateGate, async () => {
    requireInitializedStore(energy$)
    const stringInterner = createStoredStringInterner(energy$.stringTable)
    const weakUpdates: Array<
      { kind: "field"; braneIndex: number; fieldIndex: number } | { kind: "lock"; braneIndex: number; value: boolean }
    > = []
    const affectedBraneIndexes = new Set<number>()

    for (const [braneIndex, fieldUpdates, lock] of updates) {
      const brane = energy$.branes[braneIndex]
      if (!brane) {
        throw new Error(`Brane index out of range: ${braneIndex}`)
      }

      if (lock !== undefined) {
        brane.lock = lock
        weakUpdates.push({ kind: "lock", braneIndex, value: lock })
      }

      for (const [fieldIndex, value] of fieldUpdates) {
        const field = energy$.fields[fieldIndex]
        if (!field) {
          throw new Error(`Field ${fieldIndex} not defined`)
        }
        const record = findMutableFieldRecord(energy$, braneIndex, fieldIndex)
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

    syncProcessLocksForChanges(photonTargets)
    publishPhotonChanges(photonTargets)
    return changes
  })
}

export async function applyWeakResultPacket(message: EnergyWeakResultPayload): Promise<[number, number][]> {
  requireInitializedStore(energy$)

  const braneIndex = gravity$.getBraneIndex(message.wimpId)
  if (braneIndex === undefined) {
    throw new Error(`Energy weak result targets non-materialized wimp: ${message.wimpId}`)
  }

  const brane = energy$.branes[braneIndex]
  if (!brane) {
    throw new Error(`Energy weak result targets missing brane: ${braneIndex}`)
  }
  if (!brane.lock) {
    throw new Error(`Energy weak result requires locked brane for wimp ${message.wimpId}`)
  }

  const activeProcessId = getCurrentBraneProcessId(braneIndex)
  if (!activeProcessId) {
    throw new Error(`Energy weak result requires process-bound state for wimp ${message.wimpId}`)
  }
  if (activeProcessId !== message.processId) {
    throw new Error(
      `Energy weak result process mismatch for wimp ${message.wimpId}: expected ${activeProcessId}, got ${message.processId}`,
    )
  }

  const fieldUpdates: Array<[fieldIndex: number, value: unknown]> = []

  for (const part of message.parts) {
    const wimpFieldId = requireWeakResultFieldPartId(part.path)
    const [ownerBraneIndex, runtimeFieldIndex] = requireRuntimeFieldAddress(wimpFieldId)
    if (ownerBraneIndex === undefined) {
      throw new Error(`Energy weak result field is not materialized: ${wimpFieldId}`)
    }
    if (ownerBraneIndex !== braneIndex) {
      throw new Error(
        `Energy weak result field ${wimpFieldId} belongs to brane ${ownerBraneIndex}, expected ${braneIndex}`,
      )
    }
    fieldUpdates.push([runtimeFieldIndex, part.value])
  }

  return await update([[braneIndex, fieldUpdates, false]], {
    skipProcessRetriggerBraneIndexes: [braneIndex],
  })
}

const collectWeakResultPackets = (parts: EnergyParticle[]): EnergyWeakResultPayload[] => {
  const packets = new Map<string, EnergyWeakResultPayload>()

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

const isWeakResultMarker = (part: EnergyParticle): boolean =>
  part.op === "test" && (part.kind === "result" || (isRecord(part.value) && part.value.kind === "result"))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const subscribeEnergyValueBroadcast = (
  kind: "gluon" | "higgs",
): EnergyValueBroadcastSubscription => {
  return createSubscription(async (message) => {
    await applyRuntimeFieldParts(message.parts, kind)
  })
}

export function subscribeEnergyGluonBroadcast(): EnergyValueBroadcastSubscription {
  return subscribeEnergyValueBroadcast("gluon")
}

export function subscribeEnergyHiggsBroadcast(): EnergyValueBroadcastSubscription {
  return subscribeEnergyValueBroadcast("higgs")
}

export function subscribeEnergyWeakResultBroadcast(): EnergyWeakBroadcastSubscription {
  return createSubscription(async (message) => {
    for (const packet of collectWeakResultPackets(message.parts)) {
      await applyWeakResultPacket(packet)
    }
  })
}

export function unlock(indexes: number[]): void {
  requireInitializedStore(energy$)
  const weakUpdates: Array<{ kind: "lock"; braneIndex: number; value: boolean }> = []

  for (const index of indexes) {
    const brane = energy$.branes[index]
    if (!brane) {
      throw new Error(`Brane at index ${index} not found in energy`)
    }
    brane.lock = false
    weakUpdates.push({ kind: "lock", braneIndex: index, value: false })
  }

  weakHeapUpdate(weakUpdates)
}

export type { PreparedData } from "./energy.t"
export type { EnergyGravityStore } from "./gravity/store.t"
export { FieldType } from "./gravity"
export { gravity$ }
export { energy$ }
export { strong$ }
export { flattenEnergyData } from "./gravity"
