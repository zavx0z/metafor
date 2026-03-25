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
 * - `applyStructuralPatchFromSharedDb()` — обработка UUID-addressed structural patch и barrier
 * - `rebuildRuntime()` — транзакционная пересборка derived runtime из текущей composition в `gravity$`
 * - `update()` — обновление полей и вычисление следующего перехода
 * - `unlock()` — снятие блокировки с бран
 *
 * ## Архитектура
 *
 * Boundary раскладывает уже подготовленную boundary-форму через
 * `@boundary/gravity`, собирает канонический store через `@boundary/strong`
 * и оркестрирует вычисление перехода через `@boundary/weak`.
 *
 * Поверх `shared/db` Boundary держит два разных слоя:
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

import { gravity$ } from "./gravity.store"
import { boundary$ } from "./store"
import type { BoundaryFieldValueRecord, BoundaryStore } from "./store.t"
import type { PreparedData } from "./boundary.t"
import {
  prepareBoundaryRuntimeData,
  prepareBoundaryRuntimeLoadedFragmentFromSharedDb,
  prepareBoundaryRuntimeStore,
  prepareBoundaryRuntimeStoreFromSharedDb,
} from "./database"
import type { BoundarySharedDbRuntimeOptions } from "./database.t"
import { flattenBoundaryData, validateData, type Data } from "@boundary/gravity"
import { createStoredStringInterner, normalizeFieldValue, assembleStoredBoundaryData } from "@boundary/strong"
import { weakHeapUpdate, weakInit, weakRunStep, weak$ } from "@boundary/weak"
import { createEmptySharedDbData, type SharedDbBackend, type SharedDbData } from "@shared/db"
import {
  isGravitonMessage,
  METAFOR_PROTOCOL_KIND,
  openElectromagnetismBroadcastChannel,
  openGravityBroadcastChannel,
  type GravityProtocolPatch,
  type PhotonMessage,
  type ProtocolChannelOptions,
} from "@shared/protocol"

export type BoundaryStructuralPatch = GravityProtocolPatch

export interface BoundaryGravityBroadcastSubscription {
  flush(): Promise<void>
  close(): Promise<void>
}

let writeMutex: Promise<void> | null = null
let updateMutex: Promise<void> | null = null
/** Последний успешно materialized runtime-fragment, соответствующий текущему `boundary$`. */
let loadedRuntimeFragment: SharedDbData = createEmptySharedDbData()
let electromagnetismChannel: BroadcastChannel | null = null
let electromagnetismChannelName: string | undefined
const WIMP_PATCH_PATH_PREFIX = "/wimp/"

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
}

const collectRuntimeWimpIdsInBraneOrder = (fragment: SharedDbData): string[] =>
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

const refreshGravityAddressing = (fragment: SharedDbData): void => {
  const orderedWimpIds = collectRuntimeWimpIdsInBraneOrder(fragment)
  gravity$.wimpIdToBraneIndex = new Map(orderedWimpIds.map((wimpId, braneIndex) => [wimpId, braneIndex] as const))
  gravity$.braneIndexToWimpId = orderedWimpIds
}

const clearLoadedRuntimeState = (): void => {
  loadedRuntimeFragment = createEmptySharedDbData()
  clearGravityComposition()
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

  for (const [braneIndex, state] of changes) {
    const uuid = gravity$.getWimpId(braneIndex)
    if (!uuid) continue

    const message: PhotonMessage = {
      protocol: METAFOR_PROTOCOL_KIND,
      channel: "electromagnetism",
      boson: "photon",
      source: "boundary",
      target: "dark",
      uuid,
      state,
    }
    channel.postMessage(message)
  }
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

const rebuildRuntimeFromFragment = async (
  fragment: SharedDbData,
  options: BoundarySharedDbRuntimeOptions,
): Promise<[number, number][]> => {
  const prepared = fragment.wimps.length === 0 ? createEmptyPreparedData() : prepareBoundaryRuntimeStore(fragment, options)
  const changes = await writePreparedData(prepared)
  // Пока rebuild не завершился успешно, gravity maps продолжают описывать
  // предыдущее materialized runtime. Обновляем fragment и addressing только здесь.
  loadedRuntimeFragment = fragment
  refreshGravityAddressing(fragment)
  gravity$.structuralDirty = false
  return changes
}

export function prepareData(data: Data): PreparedData {
  return assembleStoredBoundaryData(flattenBoundaryData(data))
}

export function prepareRuntimeData(
  data: SharedDbData,
  options: BoundarySharedDbRuntimeOptions = {},
): Data {
  return prepareBoundaryRuntimeData(data, options)
}

export function prepareRuntimeStore(
  data: SharedDbData,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData {
  return prepareBoundaryRuntimeStore(data, options)
}

export function prepareRuntimeFromSharedDb(
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData {
  return prepareBoundaryRuntimeStoreFromSharedDb(backend, options)
}

export function listRuntimeWimpIds(): string[] {
  return [...gravity$.activeWimpIds]
}

async function writePreparedData(prepared: PreparedData): Promise<[number, number][]> {
  const prevMutex = writeMutex
  let resolveMutex: (() => void) | undefined
  writeMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  if (prevMutex) {
    await prevMutex
  }

  try {
    weak$.reset()
    applyPreparedData(prepared)

    if (!prepared.fields.length && !prepared.branes.length) {
      return []
    }

    await weakInit(boundary$)
    return []
  } finally {
    resolveMutex?.()
  }
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

export async function writeRuntimeFromSharedDb(
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): Promise<[number, number][]> {
  const fragment = prepareBoundaryRuntimeLoadedFragmentFromSharedDb(backend)
  replaceGravityComposition(collectRuntimeWimpIdsInBraneOrder(fragment))
  return await rebuildRuntimeFromFragment(fragment, options)
}

export async function rebuildRuntime(
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): Promise<[number, number][]> {
  if (!gravity$.structuralDirty) {
    // Barrier без structural изменений не трогает materialized runtime и addressing.
    return []
  }

  const nextFragment = prepareBoundaryRuntimeLoadedFragmentFromSharedDb(backend, gravity$.activeWimpIds)
  return await rebuildRuntimeFromFragment(nextFragment, options)
}

export function subscribeBoundaryGravityBroadcast(
  backend: SharedDbBackend,
  options: ProtocolChannelOptions & BoundarySharedDbRuntimeOptions = {},
): BoundaryGravityBroadcastSubscription {
  const channel = openGravityBroadcastChannel(options)
  const runtimeOptions: BoundarySharedDbRuntimeOptions = {}
  if (options.entanglement !== undefined) {
    runtimeOptions.entanglement = options.entanglement
  }

  let queue = Promise.resolve()

  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (!isGravitonMessage(event.data)) return
    if (event.data.source !== "dark") return
    if (event.data.target !== "boundary" && event.data.target !== "broadcast") return

    queue = queue.then(async () => {
      for (const patch of event.data.patches) {
        await applyStructuralPatchFromSharedDb(backend, patch, runtimeOptions)
      }
    })
  }

  const flush = async (): Promise<void> => {
    for (;;) {
      const pending = queue
      await Promise.resolve()
      await Bun.sleep(0)
      await pending
      if (pending === queue) return
    }
  }

  return {
    flush,
    async close() {
      channel.close()
      await flush()
    },
  }
}

export function addRuntimeWimp(wimpId: string): void {
  addRuntimeWimpToGravity(wimpId)
}

export function removeRuntimeWimp(wimpId: string): void {
  removeRuntimeWimpFromGravity(wimpId)
}

export async function applyStructuralPatchFromSharedDb(
  backend: SharedDbBackend,
  patch: BoundaryStructuralPatch,
  options: BoundarySharedDbRuntimeOptions = {},
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
  const prevMutex = updateMutex
  let resolveMutex: (() => void) | undefined
  updateMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  if (prevMutex) {
    await prevMutex
  }

  try {
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
    publishPhotonChanges(changes)
    return changes
  } finally {
    resolveMutex?.()
  }
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
  closeBoundaryProtocolChannels()
  electromagnetismChannelName = options.channelName
}

export type { PreparedData } from "./boundary.t"
export type { BoundaryGravityStore } from "./gravity.store.t"
export { FieldType } from "./gravity"
export { gravity$ }
export { boundary$ }
export { flattenBoundaryData } from "./gravity"
