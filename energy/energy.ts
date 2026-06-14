/**
 * @energy/energy — доменный оркестратор детерминированного перехода состояний.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * - `write()` — запись канонической energy-структуры в доменный store
 * - `gravity$` — долгоживущая UUID-композиция и адресация runtime
 * - `addRuntimeWimp()` / `removeRuntimeWimp()` — мутация composition-слоя без немедленного rebuild
 * - `applyStructuralPartFromDb()` — обработка UUID-addressed structural part и barrier
 * - `rebuildRuntime()` — транзакционная пересборка derived runtime из текущей composition в `gravity$`
 * - `update()` — обновление полей, вычисление следующего перехода и write-back в bound DB backend
 * - `applyWeakResultPacket()` / `subscribeEnergyWeakResultBroadcast()` — приём единого W-result envelope и unlock после apply
 * - `unlock()` — снятие блокировки с бран
 *
 * ## Архитектура
 *
 * Energy раскладывает уже подготовленную energy-форму через
 * `@energy/gravity`, собирает канонический store через `@energy/strong`
 * и оркестрирует вычисление перехода через `@energy/weak`.
 *
 * Поверх DB Energy держит два разных слоя:
 * - `gravity$` — composition/addressing слой, который владеет UUID-набором и
 *   текущим соответствием `uuid <-> braneIndex`,
 * - `energy$` — derived materialized runtime store, который пересобирается
 *   только на structural barrier.
 *
 * Energy НЕ содержит:
 * - source graph loading и primary addressing — это `@metafor/dark`
 * - раскладку структуры и проверку входа — это `@energy/gravity`
 * - канонизацию и сборку store-формы — это `@energy/strong`
 * - вычисление перехода и backend-адаптеры — это `@energy/weak`
 */

import { gravity$ } from "@energy/gravity/store.ts"
import { energy$ } from "./store"
import type { EnergyFieldValueRecord, EnergyStore } from "./store.t"
import type { PreparedData } from "./energy.t"
import {
  prepareEnergyRuntimeData,
  prepareEnergyRuntimeForceData,
  prepareEnergyRuntimeLoadedFragmentFromDbOperational,
  prepareEnergyRuntimeStore,
  prepareEnergyRuntimeStoreFromDb,
} from "./database"
import type { EnergyDbRuntimeOptions } from "./database.t"
import { flattenEnergyData, validateData, type Data } from "@energy/gravity"
import { FieldType } from "@energy/gravity"
import { createStoredStringInterner, normalizeFieldValue, assembleStoredEnergyData, strong$ } from "@energy/strong"
import { weakHeapUpdate, weakInit, weakRunStep, weak$ } from "@energy/weak"
import type { WeakHeapUpdate } from "./weak/weak.t"
import { createEmptyDbData, type DbBackend, type DbData } from "store/db/core"
import {force, type ForceMessage, type ForceSurface, type Particle} from "store"

export type EnergyStructuralPart = { op: "add" | "remove" | "test"; path: string; value?: unknown }
type EnergyValuePart = { op: "replace"; path: string; value: unknown }
type EnergyChannelOptions = { channelName?: string }
type EnergyWeakResultPayload = { wimpId: string; processId: string; parts: EnergyValuePart[] }

export interface EnergyBroadcastSubscription {
  close(): Promise<void>
}

export type EnergyGravityBroadcastSubscription = EnergyBroadcastSubscription
export type EnergyValueBroadcastSubscription = EnergyBroadcastSubscription
export type EnergyWeakBroadcastSubscription = EnergyBroadcastSubscription

type AsyncGate = {
  pending: null | Promise<void>
}

const writeGate: AsyncGate = { pending: null }
const updateGate: AsyncGate = { pending: null }
/** Последний успешно materialized runtime-fragment, соответствующий текущему `energy$`. */
let loadedRuntimeFragment: DbData = createEmptyDbData()
let activeDbBackend: DbBackend | null = null
const WIMP_PART_PATH_PREFIX = "/wimp/"
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
  channel: ForceSurface,
  onMessage: (message: ForceMessage) => Promise<void> | void,
): EnergyBroadcastSubscription => {
  const subscription = channel.observe((event) => {
    void (async () => {
      await onMessage(event.data)
    })()
  })

  return {
    close() {
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

const applyPreparedData = (prepared: PreparedData): void => {
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

const collectRuntimeWimpIdsInBraneOrder = (fragment: DbData): string[] =>
  [...fragment.wimps].sort((left, right) => left.wimpOrder - right.wimpOrder).map((row) => row.id)

const clearGravityComposition = (): void => {
  gravity$.activeWimpIds = []
  gravity$.wimpIdToBraneIndex.clear()
  gravity$.braneIndexToWimpId = []
  gravity$.structuralDirty = false
}

const replaceGravityComposition = (wimpIds: Iterable<string>): void => {
  gravity$.activeWimpIds = Array.from(new Set(wimpIds))
  gravity$.structuralDirty = true
}

const refreshGravityAddressing = (fragment: DbData): void => {
  const orderedWimpIds = collectRuntimeWimpIdsInBraneOrder(fragment)
  gravity$.wimpIdToBraneIndex = new Map(orderedWimpIds.map((wimpId, braneIndex) => [wimpId, braneIndex] as const))
  gravity$.braneIndexToWimpId = orderedWimpIds
}

const clearLoadedRuntimeState = (): void => {
  loadedRuntimeFragment = createEmptyDbData()
  clearGravityComposition()
  activeDbBackend = null
  strong$.reset()
  weak$.stateMetaStateIdsByBraneIndex = []
  weak$.stateProcessIdsByBraneIndex = []
}

const bindRuntimePersistence = (backend: DbBackend): void => {
  activeDbBackend = backend
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

  for (const [braneIndex, stateIndex] of changes) {
    const uuid = gravity$.getWimpId(braneIndex)
    if (!uuid) continue

    const stateName = energy$.getStateName(braneIndex, stateIndex)
    if (!stateName) continue

    force.emit({ parts: [{ part: "photon", op: "replace", path: uuid, value: stateName }] })
  }
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

const denormalizeRuntimeValue = (runtimeFieldIndex: number, value: unknown): unknown => {
  const field = energy$.fields[runtimeFieldIndex]
  if (!field) {
    throw new Error(`Energy runtime field not defined: ${runtimeFieldIndex}`)
  }

  if (field.enum) {
    if (typeof value !== "number") {
      throw new Error(`Energy enum field ${runtimeFieldIndex} must be encoded as number`)
    }
    return structuredClone(field.enum[value] ?? value)
  }

  if (field.type === FieldType.STRING_PTR) {
    if (typeof value !== "number") {
      throw new Error(`Energy string field ${runtimeFieldIndex} must be encoded as string-table index`)
    }
    return energy$.stringTable[value] ?? ""
  }

  if (field.type === FieldType.ARRAY_PTR && field.elementType === "string") {
    if (!Array.isArray(value)) {
      throw new Error(`Energy string array field ${runtimeFieldIndex} must be encoded as array`)
    }
    return value.map((item) => {
      if (typeof item !== "number") {
        throw new Error(`Energy string array field ${runtimeFieldIndex} must contain string-table indexes`)
      }
      return energy$.stringTable[item] ?? ""
    })
  }

  return structuredClone(value)
}

const addRuntimeWimpToGravity = (wimpId: string): void => {
  if (gravity$.hasWimp(wimpId)) return
  // Composition меняется сразу, но maps остаются от последнего materialized runtime до barrier rebuild.
  gravity$.activeWimpIds = [...gravity$.activeWimpIds, wimpId]
  gravity$.structuralDirty = true
}

const removeRuntimeWimpFromGravity = (wimpId: string): void => {
  if (!gravity$.hasWimp(wimpId)) return
  // Composition меняется сразу, но maps остаются от последнего materialized runtime до barrier rebuild.
  gravity$.activeWimpIds = gravity$.activeWimpIds.filter((candidate) => candidate !== wimpId)
  gravity$.structuralDirty = true
}

const requireWimpPartId = (path: string): string => {
  if (!path.startsWith(WIMP_PART_PATH_PREFIX)) {
    throw new Error(`Unsupported Energy structural part path: ${path}`)
  }

  const wimpId = path.slice(WIMP_PART_PATH_PREFIX.length)
  if (!wimpId) {
    throw new Error(`Energy structural part path is missing wimp uuid: ${path}`)
  }

  return wimpId
}

const isEmptyBarrierValue = (value: unknown): boolean => {
  if (value === undefined || value === null || value === "") return true
  if (typeof value !== "object") return false
  return Object.keys(value).length === 0
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

const applyRuntimeForceData = (fragment: DbData): void => {
  const forceData = prepareEnergyRuntimeForceData(fragment)
  strong$.runtimeFieldIndexByWimpFieldId = forceData.runtimeFieldIndexByWimpFieldId
  strong$.wimpFieldIdsByRuntimeFieldIndex = forceData.wimpFieldIdsByRuntimeFieldIndex
  strong$.braneIndexByWimpFieldId = forceData.braneIndexByWimpFieldId
  strong$.topologyWimpFieldIds = forceData.topologyWimpFieldIds
  weak$.stateMetaStateIdsByBraneIndex = forceData.stateMetaStateIdsByBraneIndex
  weak$.stateProcessIdsByBraneIndex = forceData.stateProcessIdsByBraneIndex
}

const getCurrentBraneProcessId = (braneIndex: number): string | undefined => {
  const stateIndex = energy$.states[braneIndex]
  if (stateIndex === undefined) return undefined
  return weak$.stateProcessIdsByBraneIndex[braneIndex]?.[stateIndex]
}

const rebuildRuntimeFromFragment = async (
  fragment: DbData,
  options: EnergyDbRuntimeOptions,
): Promise<[number, number][]> => {
  const prepared =
    fragment.wimps.length === 0 ? createEmptyPreparedData() : prepareEnergyRuntimeStore(fragment, options)
  const changes = await writePreparedData(prepared)
  // Пока rebuild не завершился успешно, gravity maps продолжают описывать
  // предыдущее materialized runtime. Обновляем fragment и addressing только здесь.
  loadedRuntimeFragment = fragment
  refreshGravityAddressing(fragment)
  applyRuntimeForceData(fragment)
  gravity$.structuralDirty = false
  return changes
}

const persistRuntimeChanges = async (changes: [number, number][], weakUpdates: WeakHeapUpdate[]): Promise<void> => {
  const backend = activeDbBackend
  if (!backend) return

  const nextFieldValues = new Map<number, unknown>()
  const nextStateByBraneIndex = new Map<number, number>()

  for (const update of weakUpdates) {
    if (update.kind === "field") {
      const value = energy$.getFieldValue(update.braneIndex, update.fieldIndex)
      if (value !== undefined) {
        nextFieldValues.set(update.fieldIndex, denormalizeRuntimeValue(update.fieldIndex, value))
      }
    }
  }

  for (const [braneIndex, stateIndex] of changes) {
    nextStateByBraneIndex.set(braneIndex, stateIndex)
  }

  for (const [runtimeFieldIndex, value] of nextFieldValues.entries()) {
    const wimpFieldIds = strong$.wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] ?? []
    if (wimpFieldIds.length === 0) {
      throw new Error(
        `Energy runtime persistence missing canonical field mapping for runtime field ${runtimeFieldIndex}`,
      )
    }
    await Promise.all(wimpFieldIds.map((wimpFieldId) => backend.setFieldValue(wimpFieldId, value)))
  }

  for (const [braneIndex, stateIndex] of nextStateByBraneIndex.entries()) {
    const wimpId = gravity$.getWimpId(braneIndex)
    const metaStateId = weak$.stateMetaStateIdsByBraneIndex[braneIndex]?.[stateIndex]
    if (!wimpId) {
      throw new Error(`Energy runtime persistence missing UUID mapping for brane ${braneIndex}`)
    }
    if (!metaStateId) {
      throw new Error(
        `Energy runtime persistence missing canonical state mapping for brane ${braneIndex} state ${stateIndex}`,
      )
    }
    await backend.setWimpState(wimpId, metaStateId)
  }

  await backend.flush()
}

export function prepareData(data: Data): PreparedData {
  return assembleStoredEnergyData(flattenEnergyData(data))
}

export function prepareRuntimeData(data: DbData, options: EnergyDbRuntimeOptions = {}): Data {
  return prepareEnergyRuntimeData(data, options)
}

export function prepareRuntimeStore(data: DbData, options: EnergyDbRuntimeOptions = {}): PreparedData {
  return prepareEnergyRuntimeStore(data, options)
}

export async function prepareRuntimeFromDb(
  backend: DbBackend,
  options: EnergyDbRuntimeOptions = {},
): Promise<PreparedData> {
  return await prepareEnergyRuntimeStoreFromDb(backend, options)
}

export function listRuntimeWimpIds(): string[] {
  return [...gravity$.activeWimpIds]
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
  clearLoadedRuntimeState()
  return await writePreparedData(assembleStoredEnergyData(flattenEnergyData(data)))
}

export async function writeRuntimeFromDb(
  backend: DbBackend,
  options: EnergyDbRuntimeOptions = {},
): Promise<[number, number][]> {
  const fragment = await prepareEnergyRuntimeLoadedFragmentFromDbOperational(backend)
  replaceGravityComposition(collectRuntimeWimpIdsInBraneOrder(fragment))
  bindRuntimePersistence(backend)
  return await rebuildRuntimeFromFragment(fragment, options)
}

export async function rebuildRuntime(
  backend: DbBackend,
  options: EnergyDbRuntimeOptions = {},
): Promise<[number, number][]> {
  if (!gravity$.structuralDirty) {
    // Barrier без structural изменений не трогает materialized runtime и addressing.
    return []
  }

  const nextFragment = await prepareEnergyRuntimeLoadedFragmentFromDbOperational(
    backend,
    gravity$.activeWimpIds,
  )
  bindRuntimePersistence(backend)
  return await rebuildRuntimeFromFragment(nextFragment, options)
}

export function subscribeEnergyGravityBroadcast(
  backend: DbBackend,
  options: EnergyDbRuntimeOptions = {},
): EnergyGravityBroadcastSubscription {
  const runtimeOptions: EnergyDbRuntimeOptions = {}
  if (options.entanglement !== undefined) {
    runtimeOptions.entanglement = options.entanglement
  }

  return createSubscription(force, async (message) => {
    for (const part of message.parts) {
      if (part.part !== "graviton") continue
      await applyStructuralPartFromDb(backend, part as EnergyStructuralPart, runtimeOptions)
    }
  })
}

export function addRuntimeWimp(wimpId: string): void {
  addRuntimeWimpToGravity(wimpId)
}

export function removeRuntimeWimp(wimpId: string): void {
  removeRuntimeWimpFromGravity(wimpId)
}

export async function applyStructuralPartFromDb(
  backend: DbBackend,
  part: EnergyStructuralPart,
  options: EnergyDbRuntimeOptions = {},
): Promise<[number, number][]> {
  if (part.op === "add") {
    addRuntimeWimpToGravity(requireWimpPartId(part.path))
    return []
  }

  if (part.op === "remove") {
    removeRuntimeWimpFromGravity(requireWimpPartId(part.path))
    return []
  }

  if (part.op === "test" && part.path === "" && isEmptyBarrierValue(part.value)) {
    return await rebuildRuntime(backend, options)
  }

  throw new Error(`Unsupported Energy structural part: ${part.op} ${part.path}`)
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
    await persistRuntimeChanges(changes, weakUpdates)
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

const toEnergyValuePart = (part: Particle): EnergyValuePart | null => {
  if (part.op !== "replace") return null
  return { op: "replace", path: part.path, value: part.value }
}

const collectWeakResultPackets = (parts: Particle[]): EnergyWeakResultPayload[] => {
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

const isWeakResultMarker = (part: Particle): boolean =>
  part.op === "test" && (part.kind === "result" || (isRecord(part.value) && part.value.kind === "result"))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const subscribeEnergyValueBroadcast = (
  kind: "gluon" | "higgs",
  options: EnergyChannelOptions = {},
): EnergyValueBroadcastSubscription => {
  void options
  return createSubscription(force, async (message) => {
    const parts = message.parts
      .filter((part) => part.part === kind)
      .map(toEnergyValuePart)
      .filter((part): part is EnergyValuePart => part !== null)
    await applyValueParts(parts, kind)
  })
}

export function subscribeEnergyGluonBroadcast(
  options: EnergyChannelOptions = {},
): EnergyValueBroadcastSubscription {
  return subscribeEnergyValueBroadcast("gluon", options)
}

export function subscribeEnergyHiggsBroadcast(
  options: EnergyChannelOptions = {},
): EnergyValueBroadcastSubscription {
  return subscribeEnergyValueBroadcast("higgs", options)
}

export function subscribeEnergyWeakResultBroadcast(
  options: EnergyChannelOptions = {},
): EnergyWeakBroadcastSubscription {
  void options
  return createSubscription(force, async (message) => {
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
