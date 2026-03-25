/**
 * @boundary/boundary — доменный оркестратор детерминированного перехода состояний.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * - `write()` — запись канонической boundary-структуры в доменный store
 * - `addRuntimeWimpFromSharedDb()` / `removeRuntimeWimp()` — мутация загруженного runtime-фрагмента
 * - `rebuildRuntime()` — транзакционная пересборка derived runtime из текущего загруженного фрагмента
 * - `update()` — обновление полей и вычисление следующего перехода
 * - `unlock()` — снятие блокировки с бран
 *
 * ## Архитектура
 *
 * Boundary раскладывает уже подготовленную boundary-форму через
 * `@boundary/gravity`, собирает канонический store через `@boundary/strong`
 * и оркестрирует вычисление перехода через `@boundary/weak`.
 *
 * Поверх `shared/db` Boundary держит внутренний loaded fragment:
 * каноническая DB остаётся источником мира, а `Boundary` хранит живой
 * активный runtime scope и пересобирает derived runtime уже из него, без
 * внешнего package-cache и без повторного полного чтения DB на каждом rebuild.
 *
 * Boundary НЕ содержит:
 * - source graph loading и primary addressing — это `@metafor/dark`
 * - раскладку структуры и проверку входа — это `@boundary/gravity`
 * - канонизацию и сборку store-формы — это `@boundary/strong`
 * - вычисление перехода и backend-адаптеры — это `@boundary/weak`
 */

import { boundary$ } from "./store"
import type { BoundaryFieldValueRecord, BoundaryStore } from "./store.t"
import type { PreparedData } from "./boundary.t"
import {
  mergeBoundaryRuntimeFragments,
  prepareBoundaryRuntimeData,
  prepareBoundaryRuntimeFragmentFromSharedDb,
  prepareBoundaryRuntimeLoadedFragment,
  prepareBoundaryRuntimeLoadedFragmentFromSharedDb,
  prepareBoundaryRuntimeStore,
  prepareBoundaryRuntimeStoreFromSharedDb,
} from "./database"
import type { BoundarySharedDbRuntimeOptions } from "./database.t"
import { flattenBoundaryData, validateData, type Data } from "@boundary/gravity"
import { createStoredStringInterner, normalizeFieldValue, assembleStoredBoundaryData } from "@boundary/strong"
import { weakHeapUpdate, weakInit, weakRunStep, weak$ } from "@boundary/weak"
import { createEmptySharedDbData, type SharedDbBackend, type SharedDbData } from "@shared/db"

let writeMutex: Promise<void> | null = null
let updateMutex: Promise<void> | null = null
let loadedRuntimeFragment: SharedDbData = createEmptySharedDbData()
const activeRuntimeWimpIds = new Set<string>()
let runtimeStructureDirty = false

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

const clearLoadedRuntimeFragment = (): void => {
  loadedRuntimeFragment = createEmptySharedDbData()
  activeRuntimeWimpIds.clear()
  runtimeStructureDirty = false
}

const replaceLoadedRuntimeFragment = (nextFragment: SharedDbData): void => {
  loadedRuntimeFragment = nextFragment
  activeRuntimeWimpIds.clear()

  nextFragment.wimps.forEach((row) => {
    activeRuntimeWimpIds.add(row.id)
  })

  runtimeStructureDirty = true
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
  return [...activeRuntimeWimpIds]
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
  clearLoadedRuntimeFragment()
  return await writePreparedData(assembleStoredBoundaryData(flattenBoundaryData(data)))
}

export async function writeRuntimeFromSharedDb(
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): Promise<[number, number][]> {
  replaceLoadedRuntimeFragment(prepareBoundaryRuntimeLoadedFragmentFromSharedDb(backend))
  return await rebuildRuntime(options)
}

export async function rebuildRuntime(
  options: BoundarySharedDbRuntimeOptions = {},
): Promise<[number, number][]> {
  if (!runtimeStructureDirty) {
    return []
  }

  const prepared =
    loadedRuntimeFragment.wimps.length === 0 ? createEmptyPreparedData() : prepareBoundaryRuntimeStore(loadedRuntimeFragment, options)
  const changes = await writePreparedData(prepared)
  runtimeStructureDirty = false
  return changes
}

export async function addRuntimeWimpFromSharedDb(
  backend: SharedDbBackend,
  wimpId: string,
): Promise<void> {
  activeRuntimeWimpIds.add(wimpId)
  loadedRuntimeFragment = mergeBoundaryRuntimeFragments([
    loadedRuntimeFragment,
    prepareBoundaryRuntimeFragmentFromSharedDb(backend, wimpId),
  ])
  runtimeStructureDirty = true
}

export function removeRuntimeWimp(wimpId: string): void {
  if (!activeRuntimeWimpIds.delete(wimpId)) {
    return
  }

  loadedRuntimeFragment =
    activeRuntimeWimpIds.size === 0
      ? createEmptySharedDbData()
      : prepareBoundaryRuntimeLoadedFragment(loadedRuntimeFragment, activeRuntimeWimpIds)
  runtimeStructureDirty = true
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
    return await weakRunStep()
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

export type { PreparedData } from "./boundary.t"
export { FieldType } from "./gravity"
export { boundary$ }
export { flattenBoundaryData } from "./gravity"
