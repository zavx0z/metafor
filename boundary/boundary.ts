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
import { createEmptyDbData, type DbBackend, type DbData } from "../pkg/db/core.ts"
import {
  isGluonMessage,
  isGravitonMessage,
  isHiggsMessage,
  isWMessage,
  openElectromagnetismBroadcastChannel,
  openGluonBroadcastChannel,
  openHiggsBroadcastChannel,
  openWeakWBroadcastChannel,
  type GravityProtocolPatch,
  type PhotonMessage,
  type ProtocolChannelOptions,
  type ValueProtocolPatch,
  type WMessage,
} from "@shared/protocol"
import { gravityCH } from "@boundary/gravity/channel.ts"

export type BoundaryStructuralPatch = GravityProtocolPatch

export interface BoundaryBroadcastSubscription {
  flush(): Promise<void>
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
let electromagnetismChannel: BroadcastChannel | null = null
let electromagnetismChannelName: string | undefined
const WIMP_PATCH_PATH_PREFIX = "/wimp/"
const FIELD_PATCH_PATH_PREFIX = "/field/"
const nextTask = async (): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const drainQueue = async (getQueue: () => Promise<void>): Promise<void> => {
  for (;;) {
    const pending = getQueue()
    await Promise.resolve()
    await nextTask()
    await pending
    if (pending === getQueue()) return
  }
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

const createQueuedSubscription = (
  channel: BroadcastChannel,
  onMessage: (message: unknown) => Promise<void> | void,
): BoundaryBroadcastSubscription => {
  let queue = Promise.resolve()

  channel.onmessage = (event: MessageEvent) => {
    queue = queue.then(async () => {
      await onMessage(event.data)
    })
  }

  return {
    flush: async () => await drainQueue(() => queue),
    async close() {
      channel.close()
      await drainQueue(() => queue)
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

const collectPatchedValues = (patches: ValueProtocolPatch[], kind: "gluon" | "higgs"): Record<string, unknown> => {
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

const getElectromagnetismChannel = (): BroadcastChannel => {
  electromagnetismChannel ??= openElectromagnetismBroadcastChannel(
    electromagnetismChannelName === undefined ? {} : { channelName: electromagnetismChannelName },
  )
  return electromagnetismChannel
}

const publishPhotonChanges = (changes: [number, number][]): void => {
  if (changes.length === 0) return
  const channel = getElectromagnetismChannel()

  for (const [braneIndex, stateIndex] of changes) {
    const uuid = gravity$.getWimpId(braneIndex)
    if (!uuid) continue

    const stateName = boundary$.getStateName(braneIndex, stateIndex)
    if (!stateName) continue

    const message: PhotonMessage = {
      channel: "electromagnetism",
      boson: "photon",
      source: "boundary",
      value: stateName,
      path: uuid,
    }
    channel.postMessage(message)
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

export function prepareRuntimeFromDb(
  backend: DbBackend,
  options: BoundaryDbRuntimeOptions = {},
): PreparedData {
  return prepareBoundaryRuntimeStoreFromDb(backend, options)
}

export function listRuntimeWimpIds(): string[] {
  return [...gravity$.activeWimpIds]
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
  options: ProtocolChannelOptions & BoundaryDbRuntimeOptions = {},
): BoundaryGravityBroadcastSubscription {
  const runtimeOptions: BoundaryDbRuntimeOptions = {}
  if (options.entanglement !== undefined) {
    runtimeOptions.entanglement = options.entanglement
  }

  return createQueuedSubscription(gravityCH, async (message) => {
    if (!isGravitonMessage(message)) return
    if (message.source !== "dark") return

    for (const patch of message.patches) {
      await applyStructuralPatchFromDb(backend, patch, runtimeOptions)
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
): Promise<[number, number][]> {
  return await runExclusive(updateGate, async () => {
    requireInitializedStore(boundary$)
    const stringInterner = createStoredStringInterner(boundary$.stringTable)
    const weakUpdates: Array<
      { kind: "field"; braneIndex: number; fieldIndex: number } | { kind: "lock"; braneIndex: number; value: boolean }
    > = []

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
      }
    }

    weakHeapUpdate(weakUpdates)
    const changes = await weakRunStep()
    await persistRuntimeChanges(changes, weakUpdates)
    publishPhotonChanges(changes)
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
  patches: ValueProtocolPatch[],
  kind: "gluon" | "higgs",
): Promise<[number, number][]> => {
  return await setValues(collectPatchedValues(patches, kind))
}

export async function applyWeakResultPacket(message: WMessage): Promise<[number, number][]> {
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

  const values: Record<string, unknown> = {}

  for (const patch of message.patches) {
    const wimpFieldId = requireFieldPatchId(patch.path)
    const ownerBraneIndex = strong$.braneIndexByWimpFieldId.get(wimpFieldId)
    if (ownerBraneIndex === undefined) {
      throw new Error(`Boundary weak result field is not materialized: ${wimpFieldId}`)
    }
    if (ownerBraneIndex !== braneIndex) {
      throw new Error(
        `Boundary weak result field ${wimpFieldId} belongs to brane ${ownerBraneIndex}, expected ${braneIndex}`,
      )
    }
    values[wimpFieldId] = patch.value
  }

  const changes = Object.keys(values).length === 0 ? [] : await setValues(values)
  unlock([braneIndex])
  return changes
}

const subscribeBoundaryValueBroadcast = (
  kind: "gluon" | "higgs",
  options: ProtocolChannelOptions = {},
): BoundaryValueBroadcastSubscription => {
  const channel = kind === "gluon" ? openGluonBroadcastChannel(options) : openHiggsBroadcastChannel(options)
  return createQueuedSubscription(channel, async (message) => {
    if (kind === "gluon") {
      if (!isGluonMessage(message)) return
      if (message.source !== "dark" && message.source !== "boundary") return
      await applyValuePatches(message.patches, kind)
      return
    }

    if (!isHiggsMessage(message)) return
    if (message.source !== "dark" && message.source !== "boundary") return
    await applyValuePatches(message.patches, kind)
  })
}

export function subscribeBoundaryGluonBroadcast(
  options: ProtocolChannelOptions = {},
): BoundaryValueBroadcastSubscription {
  return subscribeBoundaryValueBroadcast("gluon", options)
}

export function subscribeBoundaryHiggsBroadcast(
  options: ProtocolChannelOptions = {},
): BoundaryValueBroadcastSubscription {
  return subscribeBoundaryValueBroadcast("higgs", options)
}

export function subscribeBoundaryWeakResultBroadcast(
  options: ProtocolChannelOptions = {},
): BoundaryWeakBroadcastSubscription {
  return createQueuedSubscription(openWeakWBroadcastChannel(options), async (message) => {
    if (!isWMessage(message)) return
    if (message.source !== "bulk") return

    await applyWeakResultPacket(message)
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
  electromagnetismChannel?.close()
  electromagnetismChannel = null
  electromagnetismChannelName = undefined
}

export function configureBoundaryElectromagnetismBroadcast(options: ProtocolChannelOptions = {}): void {
  electromagnetismChannel?.close()
  electromagnetismChannel = null
  electromagnetismChannelName = options.channelName
}

export type { PreparedData } from "./boundary.t"
export type { BoundaryGravityStore } from "./gravity/store.t"
export { FieldType } from "./gravity"
export { gravity$ }
export { boundary$ }
export { strong$ }
export { flattenBoundaryData } from "./gravity"
