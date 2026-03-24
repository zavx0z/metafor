/**
 * @boundary/boundary — доменный оркестратор детерминированного перехода состояний.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * - `write()` — запись канонической boundary-структуры в доменный store
 * - `addRuntimeWimpFromSharedDb()` / `removeRuntimeWimp()` — загрузка и удаление runtime-пакетов активного фрагмента
 * - `rebuildRuntime()` — пересборка runtime из уже загруженных runtime-пакетов
 * - `update()` — обновление полей и вычисление следующего перехода
 * - `unlock()` — снятие блокировки с бран
 *
 * ## Архитектура
 *
 * Boundary раскладывает уже подготовленную boundary-форму через
 * `@boundary/gravity`, собирает канонический store через `@boundary/strong`
 * и оркестрирует вычисление перехода через `@boundary/weak`.
 *
 * Поверх `shared/db` Boundary держит активный runtime-фрагмент:
 * каноническая DB остаётся источником мира, а rebuild идёт уже из загруженных runtime-пакетов,
 * а не из полного перечитывания базы как основного режима работы.
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
  prepareBoundaryRuntimePackageFromSharedDb,
  prepareBoundaryRuntimePackagesFromSharedDb,
  prepareBoundaryRuntimeData,
  prepareBoundaryRuntimeDataFromPackages as prepareBoundaryRuntimeDataFromPackageSet,
  prepareBoundaryRuntimeStore,
  prepareBoundaryRuntimeStoreFromPackages as prepareBoundaryRuntimeStoreFromPackageSet,
} from "./database"
import type { BoundaryRuntimePackage, BoundarySharedDbRuntimeOptions } from "./database.t"
import { flattenBoundaryData, validateData, type Data } from "@boundary/gravity"
import { createStoredStringInterner, normalizeFieldValue, assembleStoredBoundaryData } from "@boundary/strong"
import { weakHeapUpdate, weakInit, weakRunStep, weak$ } from "@boundary/weak"
import type { SharedDbBackend, SharedDbData } from "@shared/db"

let writeMutex: Promise<void> | null = null
let updateMutex: Promise<void> | null = null
const runtimePackagesByWimpId = new Map<string, BoundaryRuntimePackage>()

function reset(): void {
  boundary$.reset()
  writeMutex = null
  updateMutex = null
  weak$.reset()
  runtimePackagesByWimpId.clear()
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

export function prepareRuntimeDataFromPackages(
  packages: Iterable<BoundaryRuntimePackage>,
  options: BoundarySharedDbRuntimeOptions = {},
): Data {
  return prepareBoundaryRuntimeDataFromPackageSet(packages, options)
}

export function prepareRuntimeStoreFromPackages(
  packages: Iterable<BoundaryRuntimePackage>,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData {
  return prepareBoundaryRuntimeStoreFromPackageSet(packages, options)
}

export function prepareRuntimeFromSharedDb(
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData {
  return prepareBoundaryRuntimeStoreFromPackageSet(prepareBoundaryRuntimePackagesFromSharedDb(backend), options)
}

export function listRuntimeWimpIds(): string[] {
  return [...runtimePackagesByWimpId.keys()]
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
    boundary$.reset()
    weak$.reset()
    boundary$.restore(prepared)
    await weakInit(boundary$)
    return []
  } finally {
    resolveMutex?.()
  }
}

export async function write(data: Data): Promise<[number, number][]> {
  validateData(data)
  return await writePreparedData(assembleStoredBoundaryData(flattenBoundaryData(data)))
}

export async function writeRuntimeFromSharedDb(
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): Promise<[number, number][]> {
  const runtimePackages = prepareBoundaryRuntimePackagesFromSharedDb(backend)
  const changes = await writePreparedData(prepareBoundaryRuntimeStoreFromPackageSet(runtimePackages, options))

  runtimePackagesByWimpId.clear()
  runtimePackages.forEach((pkg) => runtimePackagesByWimpId.set(pkg.wimpId, pkg))
  return changes
}

export async function rebuildRuntime(
  options: BoundarySharedDbRuntimeOptions = {},
): Promise<[number, number][]> {
  if (runtimePackagesByWimpId.size === 0) {
    reset()
    return []
  }

  return await writePreparedData(prepareBoundaryRuntimeStoreFromPackageSet(runtimePackagesByWimpId.values(), options))
}

export async function addRuntimeWimpFromSharedDb(
  backend: SharedDbBackend,
  wimpId: string,
  options: BoundarySharedDbRuntimeOptions = {},
): Promise<[number, number][]> {
  runtimePackagesByWimpId.set(wimpId, prepareBoundaryRuntimePackageFromSharedDb(backend, wimpId))
  return await rebuildRuntime(options)
}

export async function removeRuntimeWimp(
  wimpId: string,
  options: BoundarySharedDbRuntimeOptions = {},
): Promise<[number, number][]> {
  runtimePackagesByWimpId.delete(wimpId)
  return await rebuildRuntime(options)
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
export { reset, boundary$ }
export { flattenBoundaryData } from "./gravity"
export { prepareRuntimeFromSharedDb as prepareSharedDbData, writeRuntimeFromSharedDb as writeSharedDb }
