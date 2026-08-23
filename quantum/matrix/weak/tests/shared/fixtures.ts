/**
 * Общие фикстуры для тестов CPU/GPU матрицы.
 */
import {createStoredStringInterner, normalizeFieldValue} from "../../../strong"
import {FieldType} from "../../../gravity"
import {prepareMatrixData} from "../../../prepare.ts"
import type {MatrixConditionValue} from "@metafor/types/matrix/condition"
import type {MatrixBraneValue, MatrixCollapse, MatrixFieldRecord, MatrixInputData} from "@metafor/types/matrix/data"
import type { MatrixData, MatrixStore } from "@metafor/types/matrix/store"
import { STATE_NONE, STATE_UNDEFINED } from "../../constants"

function clonePreparedStore(data: MatrixData): MatrixStore {
  const cloned: MatrixStore = {
    fields: [...data.fields],
    stringTable: [...data.stringTable],
    sharedBlocks: data.sharedBlocks.map(b => ({ ...b })),
    sharedValues: data.sharedValues.map(v => ({ ...v })),
    branes: data.branes.map(b => ({ ...b })),
    braneValues: data.braneValues.map(v => ({ ...v })),
    braneSharedBlockRefs: [...data.braneSharedBlockRefs],
    stateTable: data.stateTable.map(s => ({ ...s })),
    transitions: data.transitions.map(t => ({ ...t })),
    conditions: data.conditions.map(c => ({ ...c })),
    states: [...data.states],
    stateNames: data.stateNames?.map(sn => [...sn]) ?? [],
    getField(braneIndex: number, fieldIndex: number) {
      return this.getFieldLocation(braneIndex, fieldIndex)?.record
    },
    getFieldLocation(braneIndex: number, fieldIndex: number) {
      const brane = this.branes[braneIndex]
      if (!brane) {
        return undefined
      }

      // Search local values
      const localValueEnd = brane.localValueOffset + brane.localValueCount
      for (let valueIndex = brane.localValueOffset; valueIndex < localValueEnd; valueIndex++) {
        const record = this.braneValues[valueIndex]
        if (record?.fieldIndex === fieldIndex) {
          return { scope: "local", record }
        }
      }

      // Search shared blocks
      const sharedRefEnd = brane.sharedBlockRefOffset + brane.sharedBlockRefCount
      for (let refIndex = brane.sharedBlockRefOffset; refIndex < sharedRefEnd; refIndex++) {
        const blockIndex = this.braneSharedBlockRefs[refIndex]
        if (blockIndex === undefined) {
          continue
        }

        const block = this.sharedBlocks[blockIndex]
        if (!block) {
          continue
        }

        const blockValueEnd = block.valueOffset + block.valueCount
        for (let valueIndex = block.valueOffset; valueIndex < blockValueEnd; valueIndex++) {
          const record = this.sharedValues[valueIndex]
          if (record?.fieldIndex === fieldIndex) {
            return { scope: "shared", blockIndex, record }
          }
        }
      }

      return undefined
    },
    getFieldValue(braneIndex: number, fieldIndex: number) {
      return this.getField(braneIndex, fieldIndex)?.value
    },
    getState(braneIndex: number, stateIndex: number) {
      const brane = this.branes[braneIndex]
      if (!brane || stateIndex < 0 || stateIndex >= brane.stateCount) {
        return undefined
      }
      return this.stateTable[brane.stateOffset + stateIndex]
    },
    getStateName(braneIndex: number, stateIndex: number) {
      const braneStateNames = this.stateNames[braneIndex]
      if (!braneStateNames || stateIndex < 0 || stateIndex >= braneStateNames.length) {
        return undefined
      }
      return braneStateNames[stateIndex]
    },
  }
  return cloned
}

function createBaseStore(data: MatrixInputData): MatrixStore {
  return clonePreparedStore(prepareMatrixData(data))
}

export function createEmptyFixture() {
  return {fields: [], store: createBaseStore({fields: [], branes: []})}
}

export function setBraneFieldValue(
  store: MatrixStore,
  braneIndex: number,
  fieldIndex: number,
  value: unknown,
): void {
  const record = store.getField(braneIndex, fieldIndex)
  const field = store.fields[fieldIndex]
  if (!record) {
    throw new Error(`Field ${fieldIndex} not found in brane ${braneIndex}`)
  }
  if (!field) {
    throw new Error(`Field ${fieldIndex} not defined`)
  }

  const stringInterner = createStoredStringInterner(store.stringTable)
  record.value = normalizeFieldValue(value, field as MatrixFieldRecord, stringInterner)
}

export function createSimpleBraneFixture() {
  const fields: MatrixFieldRecord[] = [{ type: FieldType.F32 }]
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

export function createConditionFixture(
  field: MatrixFieldRecord,
  value: MatrixBraneValue,
  condition: MatrixConditionValue,
) {
  const fields = [field]
  const store = createBaseStore({
    fields,
    branes: [{
      values: [[0, value]],
      state: 0,
      collapses: [[[1, {0: condition}]], [null]],
    }],
  })
  return {fields, store}
}

export function createMultipleBranesFixture() {
  const fields: MatrixFieldRecord[] = [{ type: FieldType.F32 }]
  const collapses: MatrixCollapse[][] = [
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
  const fields: MatrixFieldRecord[] = [{ type: FieldType.F32 }]
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
  const fields: MatrixFieldRecord[] = [{ type: FieldType.F32 }, { type: FieldType.F32 }]
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
  const fields: MatrixFieldRecord[] = [{ type: FieldType.STRING_PTR }]
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

export function createNullableStringPresenceFixture() {
  const fields: MatrixFieldRecord[] = [{ type: FieldType.STRING_PTR }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [[0, null]],
        state: 0,
        collapses: [
          [[1, { 0: { null: false } }]],
          [null],
        ],
      },
    ],
  })

  return { fields, store }
}

export function createArrayFieldUpdateFixture() {
  const fields: MatrixFieldRecord[] = [{ type: FieldType.ARRAY_PTR, elementType: "number" }]
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

export function createUndefinedStateFixture() {
  const fields: MatrixFieldRecord[] = [{ type: FieldType.F32 }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [[0, 10]],
        state: STATE_UNDEFINED,
        collapses: [
          [[1, { 0: { gt: 50 } }]],
          [null],
        ],
      },
    ],
    stateNames: [["born", "ready"]],
  })

  return { fields, store }
}

export function createUndefinedThenTransitionFixture() {
  const fields: MatrixFieldRecord[] = [{ type: FieldType.F32 }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [[0, 10]],
        state: STATE_UNDEFINED,
        collapses: [
          [[1, { 0: { gt: 50 } }]],
          [null],
        ],
      },
    ],
    stateNames: [["born", "ready"]],
  })

  return { fields, store }
}

export function createNoStateGraphFixture() {
  const fields: MatrixFieldRecord[] = [{ type: FieldType.F32 }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [[0, 10]],
        state: STATE_NONE,
        collapses: [],
      },
    ],
    stateNames: [[]],
  })

  return { fields, store }
}

export function createAlreadyDefinedStateFixture() {
  const fields: MatrixFieldRecord[] = [{ type: FieldType.F32 }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [[0, 100]],
        state: 1,
        collapses: [
          [[2, { 0: { gt: 50 } }]],
          [[2, { 0: { gt: 50 } }]],
          [null],
        ],
      },
    ],
    stateNames: [["cold", "warm", "hot"]],
  })

  return { fields, store }
}

export function createBranchingFixture() {
  const fields: MatrixFieldRecord[] = [{ type: FieldType.F32 }]
  const store = createBaseStore({
    fields,
    branes: [
      {
        values: [[0, 75]],
        state: 0,
        collapses: [
          [
            [1, { 0: { gt: 50 } }],
            [2, { 0: { gt: 20 } }],
          ],
          [null],
          [null],
        ],
      },
    ],
    stateNames: [["idle", "first", "second"]],
  })

  return { fields, store }
}

export function createMatrixStore<T extends { store: MatrixStore }>(fixture: T): MatrixStore {
  return clonePreparedStore(fixture.store)
}

export function createIsolatedStore<T extends { store: MatrixStore }>(fixture: T): MatrixStore {
  return createMatrixStore(fixture)
}

export function normalizeChanges(changes: Array<[number, number]>): Array<[number, number]> {
  return [...changes].sort((a, b) => a[0] - b[0])
}
