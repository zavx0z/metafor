/**
 * Общие фикстуры для тестов CPU/GPU матрицы.
 */
import { boundary$ } from "../../../store"
import { FieldType, OP, type Field } from "../../../fields"
import type { BoundaryStore } from "../../../store.t"
import type { MatrixRuntime } from "../../matrix.t"

function createBaseStore(fields: Field[], branes: BoundaryStore["branes"], states: number[]): BoundaryStore {
  return {
    fields: fields.map((field) => ({
      type: field.type,
      ...(field.elementType !== undefined ? { elementType: field.elementType } : {}),
    })),
    stringTable: [""],
    sharedBlocks: [],
    branes,
    states,
    reset: () => {
      throw new Error("reset not supported in isolated store")
    },
    restore: () => {
      throw new Error("restore not supported in isolated store")
    },
  }
}

export function createSimpleBraneFixture() {
  const fields: Field[] = [{ type: FieldType.F32 }]
  const store = createBaseStore(
    fields,
    [
      {
        localFields: [{ fieldIndex: 0, value: 100 }],
        sharedBlockIds: [],
        transitions: [
          [{ targetState: 1, conditions: [{ fieldIndex: 0, op: OP.GT, value: 50 }] }],
          [{ targetState: null, conditions: [] }],
        ],
        lock: false,
      },
    ],
    [0],
  )

  return { fields, store }
}

export function createMultipleBranesFixture() {
  const fields: Field[] = [{ type: FieldType.F32 }]
  const transitions = [
    [{ targetState: 1, conditions: [{ fieldIndex: 0, op: OP.GT, value: 50 }] }],
    [{ targetState: null, conditions: [] }],
  ]
  const store = createBaseStore(
    fields,
    [
      { localFields: [{ fieldIndex: 0, value: 100 }], sharedBlockIds: [], transitions, lock: false },
      { localFields: [{ fieldIndex: 0, value: 30 }], sharedBlockIds: [], transitions, lock: false },
      { localFields: [{ fieldIndex: 0, value: 75 }], sharedBlockIds: [], transitions, lock: false },
    ],
    [0, 0, 0],
  )

  return { fields, store }
}

export function createLockedBraneFixture() {
  const fields: Field[] = [{ type: FieldType.F32 }]
  const store = createBaseStore(
    fields,
    [
      {
        localFields: [{ fieldIndex: 0, value: 100 }],
        sharedBlockIds: [],
        transitions: [
          [{ targetState: 1, conditions: [{ fieldIndex: 0, op: OP.GT, value: 50 }] }],
          [{ targetState: null, conditions: [] }],
        ],
        lock: true,
      },
    ],
    [0],
  )

  return { fields, store }
}

export function createFieldUpdateFixture() {
  const fields: Field[] = [{ type: FieldType.F32 }, { type: FieldType.F32 }]
  const store = createBaseStore(
    fields,
    [
      {
        localFields: [
          { fieldIndex: 0, value: 40 },
          { fieldIndex: 1, value: 10 },
        ],
        sharedBlockIds: [],
        transitions: [
          [{ targetState: 1, conditions: [{ fieldIndex: 0, op: OP.GT, value: 50 }] }],
          [{ targetState: null, conditions: [] }],
        ],
        lock: false,
      },
    ],
    [0],
  )

  return { fields, store }
}

export function createBoundaryStore(fixture: ReturnType<typeof createSimpleBraneFixture>): BoundaryStore {
  const store = { ...boundary$ }
  store.fields = fixture.store.fields.map((field) => ({ ...field }))
  store.stringTable = [...fixture.store.stringTable]
  store.sharedBlocks = fixture.store.sharedBlocks.map((block) => ({
    fields: block.fields.map((field) => ({
      fieldIndex: field.fieldIndex,
      value: Array.isArray(field.value) ? [...field.value] : field.value,
    })),
  }))
  store.branes = fixture.store.branes.map((brane) => ({
    localFields: brane.localFields.map((field) => ({
      fieldIndex: field.fieldIndex,
      value: Array.isArray(field.value) ? [...field.value] : field.value,
    })),
    sharedBlockIds: [...brane.sharedBlockIds],
    transitions: brane.transitions.map((stateTransitions) =>
      stateTransitions.map((transition) => ({
        targetState: transition.targetState,
        conditions: transition.conditions.map((condition) => ({
          fieldIndex: condition.fieldIndex,
          op: condition.op,
          value: Array.isArray(condition.value) ? [...condition.value] : condition.value,
        })),
      })),
    ),
    lock: brane.lock,
  }))
  store.states = [...fixture.store.states]
  return store
}

export function createIsolatedStore(fixture: ReturnType<typeof createSimpleBraneFixture>): BoundaryStore {
  return createBoundaryStore(fixture)
}

export type RuntimeFactory = () => Promise<MatrixRuntime>

export function normalizeChanges(changes: Array<[number, number]>): Array<[number, number]> {
  return [...changes].sort((a, b) => a[0] - b[0])
}
