/**
 * @boundary/boundary — доменный оркестратор детерминированного перехода состояний.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * - `write()` — запись канонической boundary-структуры в доменный store
 * - `gravity$` — долгоживущая UUID-композиция и адресация runtime
 * - `addRuntimeWimp()` / `removeRuntimeWimp()` — мутация composition-слоя без немедленного rebuild
 * - `applyStructuralPatchFromDb()` — обработка UUID-addressed structural patch и barrier
 * - `rebuildRuntime()` — транзакционная пересборка derived runtime из текущей composition в `gravity$`
 * - `update()` — обновление полей, вычисление следующего перехода и write-back в bound DB backend
 * - `applyWeakResultPacket()` / `subscribeBoundaryWeakResultBroadcast()` — приём единого W-result envelope и unlock после apply
 * - `unlock()` — снятие блокировки с бран
 *
 * ## Архитектура
 *
 * Boundary раскладывает уже подготовленную boundary-форму через
 * `@boundary/gravity`, собирает канонический store через `@boundary/strong`
 * и оркестрирует вычисление перехода через `@boundary/weak`.
 *
 * Поверх DB Boundary держит два разных слоя:
 * - `gravity$` — composition/addressing слой, который владеет UUID-набором и
 *   текущим соответствием `uuid <-> braneIndex`,
 * - `boundary$` — derived materialized runtime store, который пересобирается
 *   только на structural barrier.
 *
 * Boundary НЕ содержит:
 * - source graph loading и primary addressing — это `@metafor/dark`
 * - раскладку структуры и проверку входа — это `@boundary/gravity`
 * - канонизацию и сборку store-формы — это `@boundary/strong`
 * - вычисление перехода и backend-адаптеры — это `@boundary/weak`
 */

import { gravity$ } from "@boundary/gravity/store.ts"
import { boundary$ } from "./store"
import type { BoundaryFieldValueRecord, BoundaryStore } from "./store.t"
import type { PreparedData } from "./boundary.t"
import {
  prepareBoundaryRuntimeData,
  prepareBoundaryRuntimeForceData,
  prepareBoundaryRuntimeLoadedFragmentFromDbOperational,
  prepareBoundaryRuntimeStore,
  prepareBoundaryRuntimeStoreFromDb,
} from "./database"
import type { BoundaryDbRuntimeOptions } from "./database.t"
import { flattenBoundaryData, validateData, type Data } from "@boundary/gravity"
import { FieldType } from "@boundary/gravity"
import { createStoredStringInterner, normalizeFieldValue, assembleStoredBoundaryData, strong$ } from "@boundary/strong"
import { weakHeapUpdate, weakInit, weakRunStep, weak$ } from "@boundary/weak"
import type { WeakHeapUpdate } from "./weak/weak.t"
import { createEmptyDbData, type DbBackend, type DbData } from "store/db/core"
import { createProtocolChannel, type ProtocolChannel, type ProtocolMessage, type ProtocolPatch } from "../protocol.ts"
import { gravityCH } from "@boundary/gravity/channel.ts"

export type BoundaryStructuralPatch = { op: "add" | "remove" | "test"; path: string; value?: unknown }
type BoundaryValuePatch = { op: "replace"; path: string; value: unknown }
type BoundaryChannelOptions = { channelName?: string }
type BoundaryWeakResultPayload = { wimpId: string; processId: string; patches: BoundaryValuePatch[] }

export interface BoundaryBroadcastSubscription {
  close(): Promise<void>
}

export type BoundaryGravityBroadcastSubscription = BoundaryBroadcastSubscription
export type BoundaryValueBroadcastSubscription = BoundaryBroadcastSubscription
export type BoundaryWeakBroadcastSubscription = BoundaryBroadcastSubscription

type AsyncGate = {
  pending: null | Promise<void>
}

const writeGate: AsyncGate = { pending: null }
const updateGate: AsyncGate = { pending: null }
/** Последний успешно materialized runtime-fragment, соответствующий текущему `boundary$`. */
let loadedRuntimeFragment: DbData = createEmptyDbData()
let activeDbBackend: DbBackend | null = null
let protocolChannel: ProtocolChannel | null = null
let protocolChannelName: string | undefined
const WIMP_PATCH_PATH_PREFIX = "/wimp/"
const FIELD_PATCH_PATH_PREFIX = "/field/"

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
  channel: ProtocolChannel,
  onMessage: (message: ProtocolMessage) => Promise<void> | void,
): BoundaryBroadcastSubscription => {
  channel.onmessage = (event) => {
    void (async () => {
      await onMessage(event.data)
    })()
  }

  return {
    close() {
      channel.close()
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
  boundary$.fields = prepared.fields
  boundary$.stringTable = prepared.stringTable
  boundary$.sharedBlocks = prepared.sharedBlocks
  boundary$.sharedValues = prepared.sharedValues
  boundary$.branes = prepared.branes
  boundary$.braneValues = prepared.braneValues
  boundary$.braneSharedBlockRefs = prepared.braneSharedBlockRefs
  boundary$.stateTable = prepared.stateTable
  boundary$.transitions = prepared.transitions
  boundary$.conditions = prepared.conditions
  boundary$.states = prepared.states
  boundary$.stateNames = prepared.stateNames
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
    throw new Error(`Boundary UUID field is not materialized in current runtime: ${wimpFieldId}`)
  }
  if (runtimeFieldIndex === undefined) {
    throw new Error(`Boundary runtime field index is missing for UUID field: ${wimpFieldId}`)
  }

  return [braneIndex, runtimeFieldIndex]
}

const collectPatchedValues = (patches: BoundaryValuePatch[], kind: "gluon" | "higgs"): Record<string, unknown> => {
  const values: Record<string, unknown> = {}

  for (const patch of patches) {
    const wimpFieldId = requireFieldPatchId(patch.path)
    const isTopology = strong$.topologyWimpFieldIds.has(wimpFieldId)

    if (kind === "gluon" && isTopology) {
      throw new Error(`Gluon patch cannot target topology field ${wimpFieldId}`)
    }
    if (kind === "higgs" && !isTopology) {
      throw new Error(`Higgs patch must target topology field ${wimpFieldId}`)
    }

    values[wimpFieldId] = patch.value
  }

  return values
}

const getProtocolChannel = (): ProtocolChannel => {
  protocolChannel ??= createProtocolChannel(protocolChannelName)
  return protocolChannel
}

const publishPhotonChanges = (changes: [number, number][]): void => {
  if (changes.length === 0) return
  const channel = getProtocolChannel()

  for (const [braneIndex, stateIndex] of changes) {
    const uuid = gravity$.getWimpId(braneIndex)
    if (!uuid) continue

    const stateName = boundary$.getStateName(braneIndex, stateIndex)
    if (!stateName) continue

    channel.postMessage({ patches: [{ part: "photon", op: "replace", path: uuid, value: stateName }] })
  }
}

const syncProcessLocksForChanges = (changes: [number, number][]): void => {
  const weakUpdates: Array<{ kind: "lock"; braneIndex: number; value: boolean }> = []

  for (const [braneIndex, stateIndex] of changes) {
    const shouldLock = weak$.stateProcessIdsByBraneIndex[braneIndex]?.[stateIndex] !== undefined
    const brane = boundary$.branes[braneIndex]
    if (!brane || brane.lock === shouldLock) continue

    brane.lock = shouldLock
    weakUpdates.push({ kind: "lock", braneIndex, value: shouldLock })
  }

  if (weakUpdates.length > 0) {
    weakHeapUpdate(weakUpdates)
  }
}

const denormalizeRuntimeValue = (runtimeFieldIndex: number, value: unknown): unknown => {
  const field = boundary$.fields[runtimeFieldIndex]
  if (!field) {
    throw new Error(`Boundary runtime field not defined: ${runtimeFieldIndex}`)
  }

  if (field.enum) {
    if (typeof value !== "number") {
      throw new Error(`Boundary enum field ${runtimeFieldIndex} must be encoded as number`)
    }
    return structuredClone(field.enum[value] ?? value)
  }

  if (field.type === FieldType.STRING_PTR) {
    if (typeof value !== "number") {
      throw new Error(`Boundary string field ${runtimeFieldIndex} must be encoded as string-table index`)
    }
    return boundary$.stringTable[value] ?? ""
  }

  if (field.type === FieldType.ARRAY_PTR && field.elementType === "string") {
    if (!Array.isArray(value)) {
      throw new Error(`Boundary string array field ${runtimeFieldIndex} must be encoded as array`)
    }
    return value.map((item) => {
      if (typeof item !== "number") {
        throw new Error(`Boundary string array field ${runtimeFieldIndex} must contain string-table indexes`)
      }
      return boundary$.stringTable[item] ?? ""
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

const requireWimpPatchId = (path: string): string => {
  if (!path.startsWith(WIMP_PATCH_PATH_PREFIX)) {
    throw new Error(`Unsupported Boundary structural patch path: ${path}`)
  }

  const wimpId = path.slice(WIMP_PATCH_PATH_PREFIX.length)
  if (!wimpId) {
    throw new Error(`Boundary structural patch path is missing wimp uuid: ${path}`)
  }

  return wimpId
}

const isEmptyBarrierValue = (value: unknown): boolean => {
  if (value === undefined || value === null || value === "") return true
  if (typeof value !== "object") return false
  return Object.keys(value).length === 0
}

const requireFieldPatchId = (path: string): string => {
  if (!path.startsWith(FIELD_PATCH_PATH_PREFIX)) {
    throw new Error(`Unsupported Boundary field patch path: ${path}`)
  }

  const wimpFieldId = path.slice(FIELD_PATCH_PATH_PREFIX.length)
  if (!wimpFieldId) {
    throw new Error(`Boundary field patch path is missing field uuid: ${path}`)
  }

  return wimpFieldId
}

const applyRuntimeForceData = (fragment: DbData): void => {
  const forceData = prepareBoundaryRuntimeForceData(fragment)
  strong$.runtimeFieldIndexByWimpFieldId = forceData.runtimeFieldIndexByWimpFieldId
  strong$.wimpFieldIdsByRuntimeFieldIndex = forceData.wimpFieldIdsByRuntimeFieldIndex
  strong$.braneIndexByWimpFieldId = forceData.braneIndexByWimpFieldId
  strong$.topologyWimpFieldIds = forceData.topologyWimpFieldIds
  weak$.stateMetaStateIdsByBraneIndex = forceData.stateMetaStateIdsByBraneIndex
  weak$.stateProcessIdsByBraneIndex = forceData.stateProcessIdsByBraneIndex
}

const getCurrentBraneProcessId = (braneIndex: number): string | undefined => {
  const stateIndex = boundary$.states[braneIndex]
  if (stateIndex === undefined) return undefined
  return weak$.stateProcessIdsByBraneIndex[braneIndex]?.[stateIndex]
}

const rebuildRuntimeFromFragment = async (
  fragment: DbData,
  options: BoundaryDbRuntimeOptions,
): Promise<[number, number][]> => {
  const prepared =
    fragment.wimps.length === 0 ? createEmptyPreparedData() : prepareBoundaryRuntimeStore(fragment, options)
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
      const value = boundary$.getFieldValue(update.braneIndex, update.fieldIndex)
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
        `Boundary runtime persistence missing canonical field mapping for runtime field ${runtimeFieldIndex}`,
      )
    }
    await Promise.all(wimpFieldIds.map((wimpFieldId) => backend.setFieldValue(wimpFieldId, value)))
  }

  for (const [braneIndex, stateIndex] of nextStateByBraneIndex.entries()) {
    const wimpId = gravity$.getWimpId(braneIndex)
    const metaStateId = weak$.stateMetaStateIdsByBraneIndex[braneIndex]?.[stateIndex]
    if (!wimpId) {
      throw new Error(`Boundary runtime persistence missing UUID mapping for brane ${braneIndex}`)
    }
    if (!metaStateId) {
      throw new Error(
        `Boundary runtime persistence missing canonical state mapping for brane ${braneIndex} state ${stateIndex}`,
      )
    }
    await backend.setWimpState(wimpId, metaStateId)
  }

  await backend.flush()
}

export function prepareData(data: Data): PreparedData {
  return assembleStoredBoundaryData(flattenBoundaryData(data))
}

export function prepareRuntimeData(data: DbData, options: BoundaryDbRuntimeOptions = {}): Data {
  return prepareBoundaryRuntimeData(data, options)
}

export function prepareRuntimeStore(data: DbData, options: BoundaryDbRuntimeOptions = {}): PreparedData {
  return prepareBoundaryRuntimeStore(data, options)
}

export async function prepareRuntimeFromDb(
  backend: DbBackend,
  options: BoundaryDbRuntimeOptions = {},
): Promise<PreparedData> {
  return await prepareBoundaryRuntimeStoreFromDb(backend, options)
}

export function listRuntimeWimpIds(): string[] {
  return [...gravity$.activeWimpIds]
}

type BoundaryUpdateOptions = {
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

    const stateIndex = boundary$.states[braneIndex]
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

    await weakInit(boundary$)
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
  return await writePreparedData(assembleStoredBoundaryData(flattenBoundaryData(data)))
}

export async function writeRuntimeFromDb(
  backend: DbBackend,
  options: BoundaryDbRuntimeOptions = {},
): Promise<[number, number][]> {
  const fragment = await prepareBoundaryRuntimeLoadedFragmentFromDbOperational(backend)
  replaceGravityComposition(collectRuntimeWimpIdsInBraneOrder(fragment))
  bindRuntimePersistence(backend)
  return await rebuildRuntimeFromFragment(fragment, options)
}

export async function rebuildRuntime(
  backend: DbBackend,
  options: BoundaryDbRuntimeOptions = {},
): Promise<[number, number][]> {
  if (!gravity$.structuralDirty) {
    // Barrier без structural изменений не трогает materialized runtime и addressing.
    return []
  }

  const nextFragment = await prepareBoundaryRuntimeLoadedFragmentFromDbOperational(
    backend,
    gravity$.activeWimpIds,
  )
  bindRuntimePersistence(backend)
  return await rebuildRuntimeFromFragment(nextFragment, options)
}

export function subscribeBoundaryGravityBroadcast(
  backend: DbBackend,
  options: BoundaryDbRuntimeOptions = {},
): BoundaryGravityBroadcastSubscription {
  const runtimeOptions: BoundaryDbRuntimeOptions = {}
  if (options.entanglement !== undefined) {
    runtimeOptions.entanglement = options.entanglement
  }

  return createSubscription(gravityCH, async (message) => {
    for (const patch of message.patches) {
      if (patch.part !== "graviton") continue
      await applyStructuralPatchFromDb(backend, patch as BoundaryStructuralPatch, runtimeOptions)
    }
  })
}

export function addRuntimeWimp(wimpId: string): void {
  addRuntimeWimpToGravity(wimpId)
}

export function removeRuntimeWimp(wimpId: string): void {
  removeRuntimeWimpFromGravity(wimpId)
}

export async function applyStructuralPatchFromDb(
  backend: DbBackend,
  patch: BoundaryStructuralPatch,
  options: BoundaryDbRuntimeOptions = {},
): Promise<[number, number][]> {
  if (patch.op === "add") {
    addRuntimeWimpToGravity(requireWimpPatchId(patch.path))
    return []
  }

  if (patch.op === "remove") {
    removeRuntimeWimpFromGravity(requireWimpPatchId(patch.path))
    return []
  }

  if (patch.op === "test" && patch.path === "" && isEmptyBarrierValue(patch.value)) {
    return await rebuildRuntime(backend, options)
  }

  throw new Error(`Unsupported Boundary structural patch: ${patch.op} ${patch.path}`)
}

function requireInitializedStore(store$: BoundaryStore): void {
  if (!store$.fields.length && !store$.branes.length) {
    throw new Error("Store not initialized. Call write() first.")
  }
}

function findMutableFieldRecord(
  store$: BoundaryStore,
  braneIndex: number,
  fieldIndex: number,
): BoundaryFieldValueRecord {
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
  options: BoundaryUpdateOptions = {},
): Promise<[number, number][]> {
  return await runExclusive(updateGate, async () => {
    requireInitializedStore(boundary$)
    const stringInterner = createStoredStringInterner(boundary$.stringTable)
    const weakUpdates: Array<
      { kind: "field"; braneIndex: number; fieldIndex: number } | { kind: "lock"; braneIndex: number; value: boolean }
    > = []
    const affectedBraneIndexes = new Set<number>()

    for (const [braneIndex, fieldUpdates, lock] of updates) {
      const brane = boundary$.branes[braneIndex]
      if (!brane) {
        throw new Error(`Brane index out of range: ${braneIndex}`)
      }

      if (lock !== undefined) {
        brane.lock = lock
        weakUpdates.push({ kind: "lock", braneIndex, value: lock })
      }

      for (const [fieldIndex, value] of fieldUpdates) {
        const field = boundary$.fields[fieldIndex]
        if (!field) {
          throw new Error(`Field ${fieldIndex} not defined`)
        }
        const record = findMutableFieldRecord(boundary$, braneIndex, fieldIndex)
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

const applyValuePatches = async (
  patches: BoundaryValuePatch[],
  kind: "gluon" | "higgs",
): Promise<[number, number][]> => {
  return await setValues(collectPatchedValues(patches, kind))
}

export async function applyWeakResultPacket(message: BoundaryWeakResultPayload): Promise<[number, number][]> {
  requireInitializedStore(boundary$)

  const braneIndex = gravity$.getBraneIndex(message.wimpId)
  if (braneIndex === undefined) {
    throw new Error(`Boundary weak result targets non-materialized wimp: ${message.wimpId}`)
  }

  const brane = boundary$.branes[braneIndex]
  if (!brane) {
    throw new Error(`Boundary weak result targets missing brane: ${braneIndex}`)
  }
  if (!brane.lock) {
    throw new Error(`Boundary weak result requires locked brane for wimp ${message.wimpId}`)
  }

  const activeProcessId = getCurrentBraneProcessId(braneIndex)
  if (!activeProcessId) {
    throw new Error(`Boundary weak result requires process-bound state for wimp ${message.wimpId}`)
  }
  if (activeProcessId !== message.processId) {
    throw new Error(
      `Boundary weak result process mismatch for wimp ${message.wimpId}: expected ${activeProcessId}, got ${message.processId}`,
    )
  }

  const fieldUpdates: Array<[fieldIndex: number, value: unknown]> = []

  for (const patch of message.patches) {
    const wimpFieldId = requireFieldPatchId(patch.path)
    const [ownerBraneIndex, runtimeFieldIndex] = requireRuntimeFieldAddress(wimpFieldId)
    if (ownerBraneIndex === undefined) {
      throw new Error(`Boundary weak result field is not materialized: ${wimpFieldId}`)
    }
    if (ownerBraneIndex !== braneIndex) {
      throw new Error(
        `Boundary weak result field ${wimpFieldId} belongs to brane ${ownerBraneIndex}, expected ${braneIndex}`,
      )
    }
    fieldUpdates.push([runtimeFieldIndex, patch.value])
  }

  return await update([[braneIndex, fieldUpdates, false]], {
    skipProcessRetriggerBraneIndexes: [braneIndex],
  })
}

const toBoundaryValuePatch = (patch: ProtocolPatch): BoundaryValuePatch | null => {
  if (patch.op !== "replace") return null
  return { op: "replace", path: patch.path, value: patch.value }
}

const collectWeakResultPackets = (patches: ProtocolPatch[]): BoundaryWeakResultPayload[] => {
  const packets = new Map<string, BoundaryWeakResultPayload>()

  for (const patch of patches) {
    if (patch.part !== "w") continue
    if (patch.op !== "replace" && !isWeakResultMarker(patch)) continue
    const wimpId = typeof patch.wimpId === "string" ? patch.wimpId : null
    const processId = typeof patch.processId === "string" ? patch.processId : null
    if (!wimpId || !processId) continue

    const key = `${wimpId}\0${processId}`
    let packet = packets.get(key)
    if (!packet) {
      packet = { wimpId, processId, patches: [] }
      packets.set(key, packet)
    }
    if (patch.op === "replace") {
      packet.patches.push({ op: "replace", path: patch.path, value: patch.value })
    }
  }

  return [...packets.values()]
}

const isWeakResultMarker = (patch: ProtocolPatch): boolean =>
  patch.op === "test" && (patch.kind === "result" || (isRecord(patch.value) && patch.value.kind === "result"))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const subscribeBoundaryValueBroadcast = (
  kind: "gluon" | "higgs",
  options: BoundaryChannelOptions = {},
): BoundaryValueBroadcastSubscription => {
  const channel = createProtocolChannel(options.channelName)
  return createSubscription(channel, async (message) => {
    const patches = message.patches
      .filter((patch) => patch.part === kind)
      .map(toBoundaryValuePatch)
      .filter((patch): patch is BoundaryValuePatch => patch !== null)
    await applyValuePatches(patches, kind)
  })
}

export function subscribeBoundaryGluonBroadcast(
  options: BoundaryChannelOptions = {},
): BoundaryValueBroadcastSubscription {
  return subscribeBoundaryValueBroadcast("gluon", options)
}

export function subscribeBoundaryHiggsBroadcast(
  options: BoundaryChannelOptions = {},
): BoundaryValueBroadcastSubscription {
  return subscribeBoundaryValueBroadcast("higgs", options)
}

export function subscribeBoundaryWeakResultBroadcast(
  options: BoundaryChannelOptions = {},
): BoundaryWeakBroadcastSubscription {
  return createSubscription(createProtocolChannel(options.channelName), async (message) => {
    for (const packet of collectWeakResultPackets(message.patches)) {
      await applyWeakResultPacket(packet)
    }
  })
}

export function unlock(indexes: number[]): void {
  requireInitializedStore(boundary$)
  const weakUpdates: Array<{ kind: "lock"; braneIndex: number; value: boolean }> = []

  for (const index of indexes) {
    const brane = boundary$.branes[index]
    if (!brane) {
      throw new Error(`Brane at index ${index} not found in boundary`)
    }
    brane.lock = false
    weakUpdates.push({ kind: "lock", braneIndex: index, value: false })
  }

  weakHeapUpdate(weakUpdates)
}

export function closeBoundaryProtocolChannels(): void {
  protocolChannel?.close()
  protocolChannel = null
  protocolChannelName = undefined
}

export function configureBoundaryProtocolBroadcast(options: BoundaryChannelOptions = {}): void {
  protocolChannel?.close()
  protocolChannel = null
  protocolChannelName = options.channelName
}

export type { PreparedData } from "./boundary.t"
export type { BoundaryGravityStore } from "./gravity/store.t"
export { FieldType } from "./gravity"
export { gravity$ }
export { boundary$ }
export { strong$ }
export { flattenBoundaryData } from "./gravity"
