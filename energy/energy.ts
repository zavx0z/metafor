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
import type { EnergyFieldValueRecord, EnergyStore } from "./store.t"
import type { PreparedData } from "./energy.t"
import {force, type EnergyForceMessage, type EnergyParticle} from "./channel"
import { flattenEnergyData, validateData, type Data } from "@energy/gravity"
import { createStoredStringInterner, normalizeFieldValue, assembleStoredEnergyData, strong$ } from "@energy/strong"
import { weakHeapUpdate, weakInit, weakRunStep, weak$ } from "@energy/weak"

type EnergyValuePart = { op: "replace"; path: string; value: unknown }
type EnergyWeakResultPayload = { wimpId: string; processId: string; parts: EnergyValuePart[] }

export type EnergyRuntimeSnapshot = {
  ok: true
  version: 1
  wimpIds: string[]
  data: Data
  strong: {
    runtimeFieldIndexByWimpFieldId: Array<[string, number]>
    wimpFieldIdsByRuntimeFieldIndex: string[][]
    braneIndexByWimpFieldId: Array<[string, number]>
    topologyWimpFieldIds: string[]
  }
  weak: {
    stateMetaStateIdsByBraneIndex: string[][]
    stateProcessIdsByBraneIndex: Array<Array<string | null | undefined>>
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
const FIELD_PART_PATH_PREFIX = "/field/"

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
  gravity$.wimpIdToBraneIndex.clear()
  gravity$.braneIndexToWimpId = []
  gravity$.structuralDirty = false
}

const clearRuntimeState = (): void => {
  applyPreparedData(createEmptyPreparedData())
  clearRuntimeAddressing()
  strong$.reset()
  weak$.reset()
}

const requireRuntimeFieldAddress = (wimpFieldId: string): [braneIndex: number, runtimeFieldIndex: number] => {
  const braneIndex = strong$.braneIndexByWimpFieldId.get(wimpFieldId)
  const runtimeFieldIndex = strong$.runtimeFieldIndexByWimpFieldId.get(wimpFieldId)

  if (braneIndex === undefined) {
    throw new Error(`Energy UUID field is not materialized in current runtime: ${wimpFieldId}`)
  }
  if (runtimeFieldIndex === undefined) {
    throw new Error(`Energy runtime field index is missing for UUID field: ${wimpFieldId}`)
  }

  return [braneIndex, runtimeFieldIndex]
}

const collectPartValues = (parts: EnergyValuePart[], kind: "gluon" | "higgs"): Record<string, unknown> => {
  const values: Record<string, unknown> = {}

  for (const part of parts) {
    const wimpFieldId = requireFieldPartId(part.path)
    const isTopology = strong$.topologyWimpFieldIds.has(wimpFieldId)

    if (kind === "gluon" && isTopology) {
      throw new Error(`Gluon part cannot target topology field ${wimpFieldId}`)
    }
    if (kind === "higgs" && !isTopology) {
      throw new Error(`Higgs part must target topology field ${wimpFieldId}`)
    }

    values[wimpFieldId] = part.value
  }

  return values
}

const publishPhotonChanges = (changes: [number, number][]): void => {
  if (changes.length === 0) return
  const parts: EnergyParticle[] = []

  for (const [braneIndex, stateIndex] of changes) {
    const uuid = gravity$.getWimpId(braneIndex)
    if (!uuid) continue

    const stateName = energy$.getStateName(braneIndex, stateIndex)
    if (!stateName) continue

    parts.push({ part: "photon", op: "replace", path: uuid, value: stateName })
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

const requireFieldPartId = (path: string): string => {
  if (!path.startsWith(FIELD_PART_PATH_PREFIX)) {
    throw new Error(`Unsupported Energy field part path: ${path}`)
  }

  const wimpFieldId = path.slice(FIELD_PART_PATH_PREFIX.length)
  if (!wimpFieldId) {
    throw new Error(`Energy field part path is missing field uuid: ${path}`)
  }

  return wimpFieldId
}

const getCurrentBraneProcessId = (braneIndex: number): string | undefined => {
  const stateIndex = energy$.states[braneIndex]
  if (stateIndex === undefined) return undefined
  return weak$.stateProcessIdsByBraneIndex[braneIndex]?.[stateIndex]
}

export function prepareData(data: Data): PreparedData {
  return assembleStoredEnergyData(flattenEnergyData(data))
}

export function listRuntimeWimpIds(): string[] {
  return [...gravity$.activeWimpIds]
}

export async function loadRuntimeSnapshot(snapshot: EnergyRuntimeSnapshot): Promise<void> {
  const prepared = assembleStoredEnergyData(flattenEnergyData(snapshot.data))
  applyPreparedData(prepared)

  if (prepared.fields.length > 0 || prepared.branes.length > 0) {
    await weakInit(energy$)
  } else {
    weak$.reset()
  }

  gravity$.activeWimpIds = [...snapshot.wimpIds]
  gravity$.braneIndexToWimpId = [...snapshot.wimpIds]
  gravity$.wimpIdToBraneIndex = new Map(snapshot.wimpIds.map((wimpId, braneIndex) => [wimpId, braneIndex] as const))
  gravity$.structuralDirty = false

  strong$.runtimeFieldIndexByWimpFieldId = new Map(snapshot.strong.runtimeFieldIndexByWimpFieldId)
  strong$.wimpFieldIdsByRuntimeFieldIndex = snapshot.strong.wimpFieldIdsByRuntimeFieldIndex.map((ids) => [...ids])
  strong$.braneIndexByWimpFieldId = new Map(snapshot.strong.braneIndexByWimpFieldId)
  strong$.topologyWimpFieldIds = new Set(snapshot.strong.topologyWimpFieldIds)

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
   * `write(data)` остаётся отдельным bootstrap/bypass path и не порождает UUID-composition.
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

        // Runtime field may be shared across multiple UUID-addressed fields via source/entanglement.
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

export async function setValues(values: Record<string, unknown>): Promise<[number, number][]> {
  const groupedUpdates = new Map<number, Array<[number, unknown]>>()

  for (const [wimpFieldId, value] of Object.entries(values)) {
    const [braneIndex, runtimeFieldIndex] = requireRuntimeFieldAddress(wimpFieldId)

    const fieldUpdates = groupedUpdates.get(braneIndex)
    if (fieldUpdates) {
      fieldUpdates.push([runtimeFieldIndex, value])
    } else {
      groupedUpdates.set(braneIndex, [[runtimeFieldIndex, value]])
    }
  }

  return await update(Array.from(groupedUpdates, ([braneIndex, fieldUpdates]) => [braneIndex, fieldUpdates]))
}

const runtimeFieldIdFromPartPath = (path: string): string =>
  path.startsWith(FIELD_PART_PATH_PREFIX) ? path.slice(FIELD_PART_PATH_PREFIX.length) : path

export async function applyRuntimeValueParts(parts: EnergyParticle[]): Promise<[number, number][]> {
  if (!weak$.initialized) return []

  const stringInterner = createStoredStringInterner(energy$.stringTable)
  const updates: Array<{kind: "field"; braneIndex: number; fieldIndex: number}> = []

  for (const part of parts) {
    if ((part.part !== "gluon" && part.part !== "higgs") || part.op !== "replace") continue

    const wimpFieldId = runtimeFieldIdFromPartPath(part.path)
    const braneIndex = strong$.braneIndexByWimpFieldId.get(wimpFieldId)
    const fieldIndex = strong$.runtimeFieldIndexByWimpFieldId.get(wimpFieldId)
    if (braneIndex === undefined || fieldIndex === undefined) continue

    const field = energy$.fields[fieldIndex]
    const record = energy$.getField(braneIndex, fieldIndex)
    if (!field || !record) continue

    record.value = normalizeFieldValue(part.value, field, stringInterner)
    updates.push({kind: "field", braneIndex, fieldIndex})
  }

  if (updates.length === 0) return []

  weakHeapUpdate(updates)
  const changes = await weakRunStep()
  publishPhotonChanges(changes)
  return changes
}

const applyValueParts = async (
  parts: EnergyValuePart[],
  kind: "gluon" | "higgs",
): Promise<[number, number][]> => {
  return await setValues(collectPartValues(parts, kind))
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
    const wimpFieldId = requireFieldPartId(part.path)
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

const toEnergyValuePart = (part: EnergyParticle): EnergyValuePart | null => {
  if (part.op !== "replace") return null
  return { op: "replace", path: part.path, value: part.value }
}

const collectWeakResultPackets = (parts: EnergyParticle[]): EnergyWeakResultPayload[] => {
  const packets = new Map<string, EnergyWeakResultPayload>()

  for (const part of parts) {
    if (part.part !== "w") continue
    if (part.op !== "replace" && !isWeakResultMarker(part)) continue
    const wimpId = typeof part.wimpId === "string" ? part.wimpId : null
    const processId = typeof part.processId === "string" ? part.processId : null
    if (!wimpId || !processId) continue

    const key = `${wimpId}\0${processId}`
    let packet = packets.get(key)
    if (!packet) {
      packet = { wimpId, processId, parts: [] }
      packets.set(key, packet)
    }
    if (part.op === "replace") {
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
    const parts = message.parts
      .filter((part) => part.part === kind)
      .map(toEnergyValuePart)
      .filter((part): part is EnergyValuePart => part !== null)
    await applyValueParts(parts, kind)
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
