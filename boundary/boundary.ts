/**
 * @boundary/boundary — оркестратор детерминированной эволюции суперпозиций.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * - `write()` — инициализация Boundary store из подготовленных данных
 * - `update()` — обновление полей и шаг эволюции
 * - `unlock()` — снятие блокировки с бран
 *
 * ## Архитектура
 *
 * Boundary получает подготовленные данные от `@boundary/fields` и оркестрирует
 * инициализацию Matrix runtime.
 *
 * Boundary НЕ содержит:
 * - подготовку данных (flatten/assemble) — это `@boundary/fields`
 * - packed execution forms — это `@boundary/matrix`
 * - debug/export утилиты — это `@boundary/matrix/debug`
 */

import { matrixHeapUpdate, matrixInit, matrixRunStep, matrixStoreReset } from "./matrix"
import { findBraneFieldRecord } from "./store.access"
import { boundary$ } from "./store"
import type {
  BoundaryData,
  BoundaryFieldValueRecord,
  BoundaryStore,
} from "./store.t"
import {
  assembleStoredBoundaryData,
  createStoredStringInterner,
  normalizeFieldValue,
  parseCondition,
  validateData,
  type BraneValue,
  type Data,
  type FlattenedBoundaryInput,
} from "./fields"
import type { Field } from "./fields/index.t"

export type PreparedData = BoundaryData

let writeMutex: Promise<void> | null = null
let updateMutex: Promise<void> | null = null

function reset(): void {
  boundary$.reset()
  writeMutex = null
  updateMutex = null
  matrixStoreReset()
}

export function flattenBoundaryData(data: Data): FlattenedBoundaryInput {
  return {
    fields: [...(data.fields ?? [])],
    branes: (data.branes ?? []).map((brane) => ({
      values: brane.values.map(([fieldIndex, value]) => [fieldIndex, value] as [number, BraneValue]),
      state: brane.state,
      transitions: brane.collapses.map((stateTransitions) =>
        stateTransitions.map((collapse) =>
          collapse === null
            ? { targetState: null, conditions: [] }
            : {
                targetState: collapse[0],
                conditions: Object.entries(collapse[1]).map(([fieldIndex, condition]) => ({
                  fieldIndex: Number(fieldIndex),
                  checks: parseCondition(condition),
                })),
              },
        ),
      ),
    })),
    ...(data.entanglement !== undefined ? { entanglement: data.entanglement } : {}),
  }
}

export function prepareData(data: Data): PreparedData {
  return assembleStoredBoundaryData(flattenBoundaryData(data))
}

export async function write(data: Data): Promise<[number, number][]> {
  const prevMutex = writeMutex
  let resolveMutex: (() => void) | undefined
  writeMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  if (prevMutex) {
    await prevMutex
  }

  try {
    validateData(data)
    boundary$.reset()
    matrixStoreReset()
    const flattened = flattenBoundaryData(data)
    const prepared = assembleStoredBoundaryData(flattened)
    boundary$.restore(prepared)
    await matrixInit(boundary$)
    return []
  } finally {
    resolveMutex?.()
  }
}

function requireInitializedStore(store: BoundaryStore): void {
  if (!store.fields.length && !store.branes.length) {
    throw new Error("Store not initialized. Call write() first.")
  }
}

function findMutableFieldRecord(store: BoundaryStore, braneIndex: number, fieldIndex: number): BoundaryFieldValueRecord {
  if (!store.branes[braneIndex]) {
    throw new Error(`Brane index out of range: ${braneIndex}`)
  }

  const fieldRecord = findBraneFieldRecord(store, braneIndex, fieldIndex)
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
    const matrixUpdates: Array<{ kind: "field"; braneIndex: number; fieldIndex: number } | { kind: "lock"; braneIndex: number; value: boolean }> = []

    for (const [braneIndex, fieldUpdates, lock] of updates) {
      const brane = boundary$.branes[braneIndex]
      if (!brane) {
        throw new Error(`Brane index out of range: ${braneIndex}`)
      }

      if (lock !== undefined) {
        brane.lock = lock
        matrixUpdates.push({ kind: "lock", braneIndex, value: lock })
      }

      for (const [fieldIndex, value] of fieldUpdates) {
        const field = boundary$.fields[fieldIndex]
        if (!field) {
          throw new Error(`Field ${fieldIndex} not defined`)
        }
        const record = findMutableFieldRecord(boundary$, braneIndex, fieldIndex)
        record.value = normalizeFieldValue(value, field, stringInterner)
        matrixUpdates.push({ kind: "field", braneIndex, fieldIndex })
      }
    }

    matrixHeapUpdate(matrixUpdates)
    return await matrixRunStep()
  } finally {
    resolveMutex?.()
  }
}

export function unlock(indexes: number[]): void {
  requireInitializedStore(boundary$)
  const matrixUpdates: Array<{ kind: "lock"; braneIndex: number; value: boolean }> = []

  for (const index of indexes) {
    const brane = boundary$.branes[index]
    if (!brane) {
      throw new Error(`Brane at index ${index} not found in boundary`)
    }
    brane.lock = false
    matrixUpdates.push({ kind: "lock", braneIndex: index, value: false })
  }

  matrixHeapUpdate(matrixUpdates)
}

export type {
  Field,
  Data,
  Brane,
  Collapse,
  BraneValue,
  FieldTypeValue,
  FlattenedBoundaryInput,
  FlattenedBraneInput,
  FlattenedFieldChecks,
  FlattenedTransition,
} from "./fields"

export type {
  BoundaryData,
  BoundaryStore,
  BoundaryFieldRecord,
  BoundaryFieldValueRecord,
  BoundaryConditionRecord,
  BoundaryTransitionRecord,
  BoundaryStateRecord,
  BoundarySharedBlockRecord,
  BoundaryBraneRecord,
  BoundaryScalarValue,
  BoundaryValue,
} from "./store.t"

export { FieldType } from "./fields"

export { reset, boundary$ }
