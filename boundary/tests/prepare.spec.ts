/**
 * Тесты для prepareData.
 */
import { test, expect, describe } from "bun:test"
import { flattenBoundaryData, prepareData } from "../boundary"
import type { BoundaryData, BoundaryTransitionRecord } from "../store.t"
import { FieldType, type Data } from "../fields/index.t"
import { OP } from "../matrix/constants"

function getBraneLocalValues(store: BoundaryData, braneIndex: number) {
  const brane = store.branes[braneIndex]
  if (!brane) {
    return []
  }
  return store.braneValues.slice(brane.localValueOffset, brane.localValueOffset + brane.localValueCount)
}

function getBraneSharedBlockIds(store: BoundaryData, braneIndex: number) {
  const brane = store.branes[braneIndex]
  if (!brane) {
    return []
  }
  return store.braneSharedBlockRefs.slice(brane.sharedBlockRefOffset, brane.sharedBlockRefOffset + brane.sharedBlockRefCount)
}

function getSharedBlockValues(store: BoundaryData, blockIndex: number) {
  const block = store.sharedBlocks[blockIndex]
  if (!block) {
    return []
  }
  return store.sharedValues.slice(block.valueOffset, block.valueOffset + block.valueCount)
}

function getBraneStateTransitions(store: BoundaryData, braneIndex: number, stateIndex: number) {
  const brane = store.branes[braneIndex]
  if (!brane || stateIndex < 0 || stateIndex >= brane.stateCount) {
    return []
  }

  const state = store.stateTable[brane.stateOffset + stateIndex]
  if (!state) {
    return []
  }

  return store.transitions
    .slice(state.transitionOffset, state.transitionOffset + state.transitionCount)
    .map((transition: BoundaryTransitionRecord) => ({
      targetState: transition.targetState,
      conditions: store.conditions.slice(
        transition.conditionOffset,
        transition.conditionOffset + transition.conditionCount,
      ),
    }))
}

describe("prepareData — подготовка canonical JS store", () => {
  test("Boundary flattening должен переводить nested conditions в parsed checks", () => {
    const data: Data = {
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [[0, 100]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50, lte: 100 } }]], [null]],
      }],
    }

    const flattened = flattenBoundaryData(data)

    expect(flattened.branes).toHaveLength(1)
    expect(flattened.branes[0]?.transitions[0]?.[0]).toEqual({
      targetState: 1,
      conditions: [
        {
          fieldIndex: 0,
          checks: [
            { op: OP.GT, val: 50 },
            { op: OP.LTE, val: 100 },
          ],
        },
      ],
    })
  })

  test("должен подготовить flat indexed JS store для 1 браны с 1 полем", () => {
    const result = prepareData({
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [[0, 100]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null]],
      }],
    })

    expect(result.fields).toEqual([{ type: FieldType.F32 }])
    expect(result.sharedBlocks).toEqual([])
    expect(result.sharedValues).toEqual([])
    expect(result.states).toEqual([0])
    expect(getBraneLocalValues(result, 0)).toEqual([{ fieldIndex: 0, value: 100 }])
    expect(getBraneStateTransitions(result, 0, 0)).toEqual([
      {
        targetState: 1,
        conditions: [{ fieldIndex: 0, op: OP.GT, value: 50 }],
      },
    ])
    expect(getBraneStateTransitions(result, 0, 1)).toEqual([])
  })

  test("должен подготовить entanglement как shared blocks + refs", () => {
    const result = prepareData({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { values: [[0, 100]], state: 0, collapses: [[null]] },
        { values: [[0, 100]], state: 0, collapses: [[null]] },
      ],
      entanglement: {
        blocks: [
          {
            braneIndices: [0, 1],
            fields: [
              {
                fieldIndex: 0,
                fieldName: "hp",
                payloadIds: ["payload:hp"],
                semanticKeys: ["fields:/fields/hp:"],
                representativeBraneIndex: 0,
              },
            ],
          },
        ],
      },
    })

    expect(result.sharedBlocks).toHaveLength(1)
    expect(getSharedBlockValues(result, 0)).toEqual([{ fieldIndex: 0, value: 100 }])
    expect(getBraneLocalValues(result, 0)).toEqual([])
    expect(getBraneLocalValues(result, 1)).toEqual([])
    expect(getBraneSharedBlockIds(result, 0)).toEqual([0])
    expect(getBraneSharedBlockIds(result, 1)).toEqual([0])
  })

  test("Fields должен дедуплицировать строки и state graph в canonical store", () => {
    const result = prepareData({
      fields: [{ type: FieldType.STRING_PTR }],
      branes: [
        {
          values: [[0, "hello"]],
          state: 0,
          collapses: [[[1, { 0: { eq: "hello" } }]], [null]],
        },
        {
          values: [[0, "hello"]],
          state: 0,
          collapses: [[[1, { 0: { eq: "hello" } }]], [null]],
        },
      ],
    })

    expect(result.stringTable.filter((value) => value === "hello")).toHaveLength(1)
    expect(getBraneLocalValues(result, 0)).toEqual([{ fieldIndex: 0, value: 1 }])
    expect(getBraneLocalValues(result, 1)).toEqual([{ fieldIndex: 0, value: 1 }])
    expect(getBraneStateTransitions(result, 0, 0)).toEqual([
      { targetState: 1, conditions: [{ fieldIndex: 0, op: OP.EQ, value: 1 }] },
    ])
    expect(result.branes[0]?.stateOffset).toBe(result.branes[1]?.stateOffset)
    expect(result.stateTable).toHaveLength(2)
  })

  test("должен хранить ARRAY поля в canonical JS store без heap reserve", () => {
    const result = prepareData({
      fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
      branes: [
        {
          values: [[0, [1, 2, 3, 4, 5]]],
          state: 0,
          collapses: [[null]],
        },
      ],
    })

    expect(getBraneLocalValues(result, 0)).toEqual([{ fieldIndex: 0, value: [1, 2, 3, 4, 5] }])
    expect(result.sharedBlocks).toEqual([])
    expect(result.transitions).toEqual([])
    expect(result.conditions).toEqual([])
  })
})
