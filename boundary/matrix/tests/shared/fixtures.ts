/**
 * Общие фикстуры для тестов CPU/GPU матрицы.
 */
import { prepareData } from "../../../boundary"
import { findBraneFieldRecord } from "../../../store.access"
import { createStoredStringInterner, normalizeFieldValue } from "../../../fields"
import { FieldType, type Collapse, type Data, type Field } from "../../../fields"
import type { BoundaryData, BoundaryStore } from "../../../store.t"
import type { MatrixRuntime } from "../../matrix.t"

function clonePreparedStore(data: BoundaryData): BoundaryStore {
  const cloned = structuredClone(data)
  return {
    ...cloned,
    reset: () => {
      throw new Error("reset not supported in isolated store")
    },
    restore: () => {
      throw new Error("restore not supported in isolated store")
    },
  }
}

function createBaseStore(data: Data): BoundaryStore {
  return clonePreparedStore(prepareData(data))
}

export function setBraneFieldValue(
  store: BoundaryStore,
  braneIndex: number,
  fieldIndex: number,
  value: unknown,
): void {
  const record = findBraneFieldRecord(store, braneIndex, fieldIndex)
  const field = store.fields[fieldIndex]
  if (!record) {
    throw new Error(`Field ${fieldIndex} not found in brane ${braneIndex}`)
  }
  if (!field) {
    throw new Error(`Field ${fieldIndex} not defined`)
  }

  const stringInterner = createStoredStringInterner(store.stringTable)
  record.value = normalizeFieldValue(value, field as Field, stringInterner)
}

export function createSimpleBraneFixture() {
  const fields: Field[] = [{ type: FieldType.F32 }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [[0, 100]],
        state: 0,
        collapses: [
          [[1, { 0: { gt: 50 } }]],
          [null],
        ],
      },
    ],
  })

  return { fields, store }
}

export function createMultipleBranesFixture() {
  const fields: Field[] = [{ type: FieldType.F32 }]
  const collapses: Collapse[][] = [
    [[1, { 0: { gt: 50 } }]],
    [null],
  ]
  const store = createBaseStore({
    fields,
    branes: [
      { values: [[0, 100]], state: 0, collapses },
      { values: [[0, 30]], state: 0, collapses },
      { values: [[0, 75]], state: 0, collapses },
    ],
  })

  return { fields, store }
}

export function createLockedBraneFixture() {
  const fields: Field[] = [{ type: FieldType.F32 }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [[0, 100]],
        state: 0,
        collapses: [
          [[1, { 0: { gt: 50 } }]],
          [null],
        ],
      },
    ],
  })

  store.branes[0]!.lock = true
  return { fields, store }
}

export function createFieldUpdateFixture() {
  const fields: Field[] = [{ type: FieldType.F32 }, { type: FieldType.F32 }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [
          [0, 40],
          [1, 10],
        ],
        state: 0,
        collapses: [
          [[1, { 0: { gt: 50 } }]],
          [null],
        ],
      },
    ],
  })

  return { fields, store }
}

export function createStringFieldUpdateFixture() {
  const fields: Field[] = [{ type: FieldType.STRING_PTR }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [[0, "hero"]],
        state: 0,
        collapses: [
          [[1, { 0: { eq: "mage" } }]],
          [null],
        ],
      },
    ],
  })

  return { fields, store }
}

export function createArrayFieldUpdateFixture() {
  const fields: Field[] = [{ type: FieldType.ARRAY_PTR, elementType: "number" }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [[0, [1]]],
        state: 0,
        collapses: [
          [[1, { 0: { include: 2 } }]],
          [null],
        ],
      },
    ],
  })

  return { fields, store }
}

export function createBoundaryStore<T extends { store: BoundaryStore }>(fixture: T): BoundaryStore {
  const { reset: _reset, restore: _restore, ...data } = fixture.store
  return clonePreparedStore(data)
}

export function createIsolatedStore<T extends { store: BoundaryStore }>(fixture: T): BoundaryStore {
  return createBoundaryStore(fixture)
}

export type RuntimeFactory = () => Promise<MatrixRuntime>

export function normalizeChanges(changes: Array<[number, number]>): Array<[number, number]> {
  return [...changes].sort((a, b) => a[0] - b[0])
}
