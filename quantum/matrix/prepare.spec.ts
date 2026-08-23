import { describe, expect, test } from "bun:test"
import type { MatrixInputData } from "@matrix/types/data"
import { prepareMatrixData } from "./prepare"

function createBaseData(): MatrixInputData {
  return {
    fields: [
      { type: 0 },
      { type: 1 },
    ],
    branes: [
      {
        values: [[0, 1], [1, 2]],
        state: 0,
        collapses: [[null]],
      },
    ],
  }
}

describe("prepareMatrixData", () => {
  test("produces a canonical store from the compact input", () => {
    const store = prepareMatrixData(createBaseData())

    expect(store.fields).toEqual([{ type: 0 }, { type: 1 }])
    expect(store.branes).toHaveLength(1)
    expect(store.branes[0]).toEqual({
      localValueOffset: 0,
      localValueCount: 2,
      sharedBlockRefOffset: 0,
      sharedBlockRefCount: 0,
      stateOffset: 0,
      stateCount: 1,
      lock: false,
    })
    expect(store.braneValues).toEqual([
      { fieldIndex: 0, value: 1 },
      { fieldIndex: 1, value: 2 },
    ])
    expect(store.stateTable).toEqual([{ transitionOffset: 0, transitionCount: 0 }])
    expect(store.states).toEqual([0])
  })

  test("materializes declared shared blocks", () => {
    const store = prepareMatrixData({
      fields: [{ type: 0 }],
      branes: [
        { values: [[0, 5]], state: 0, collapses: [[null]] },
        { values: [[0, 5]], state: 0, collapses: [[null]] },
      ],
      entanglement: {
        blocks: [{
          key: "shared-value",
          braneIndices: [0, 1],
          fields: [{
            fieldIndex: 0,
            fieldName: "value",
            payloadIds: ["a", "b"],
            semanticKeys: ["owner/a:value", "owner/b:value"],
            representativeBraneIndex: 0,
          }],
        }],
      },
    })

    expect(store.sharedBlocks).toEqual([{ valueOffset: 0, valueCount: 1 }])
    expect(store.sharedValues).toEqual([{ fieldIndex: 0, value: 5 }])
    expect(store.braneValues).toEqual([])
    expect(store.braneSharedBlockRefs).toEqual([0, 0])
  })

  test("deduplicates identical state graphs", () => {
    const data: MatrixInputData = {
      fields: [{ type: 0 }],
      branes: [
        {
          values: [[0, 1]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 0 } }]],
            [null],
          ],
        },
        {
          values: [[0, 2]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 0 } }]],
            [null],
          ],
        },
      ],
    }

    const store = prepareMatrixData(data)

    expect(store.stateTable).toHaveLength(2)
    expect(store.transitions).toHaveLength(1)
    expect(store.conditions).toHaveLength(1)
    expect(store.branes[0]?.stateOffset).toBe(0)
    expect(store.branes[1]?.stateOffset).toBe(0)
  })
})
