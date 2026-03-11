import { describe, expect, test } from "bun:test"
import { prepareData } from "../boundary"
import type { BoundaryData } from "../store.t"
import { FieldType, type Data } from "../gravity"

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

describe("prepared entanglement projection", () => {
  test("boundary не выводит entanglement из одинаковых values без projection", () => {
    const data: Data = {
      fields: [{ type: FieldType.F32 }],
      branes: [
        { values: [[0, 100]], state: 0, collapses: [[null]] },
        { values: [[0, 100]], state: 0, collapses: [[null]] },
      ],
    }

    const prepared = prepareData(data)

    expect(prepared.sharedBlocks).toEqual([])
    expect(getBraneLocalValues(prepared, 0)).toEqual([{ fieldIndex: 0, value: 100 }])
    expect(getBraneLocalValues(prepared, 1)).toEqual([{ fieldIndex: 0, value: 100 }])
    expect(getBraneSharedBlockIds(prepared, 0)).toEqual([])
    expect(getBraneSharedBlockIds(prepared, 1)).toEqual([])
  })

  test("boundary materializes shared блоки только из prepared projection", () => {
    const data: Data = {
      fields: [
        { type: FieldType.F32 },
        { type: FieldType.F32 },
      ],
      branes: [
        { values: [[0, 100], [1, 10]], state: 0, collapses: [[null]] },
        { values: [[0, 100], [1, 20]], state: 0, collapses: [[null]] },
      ],
      entanglement: {
        blocks: [
          {
            key: "0,1",
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
    }

    const prepared = prepareData(data)

    expect(getSharedBlockValues(prepared, 0)).toEqual([{ fieldIndex: 0, value: 100 }])
    expect(getBraneLocalValues(prepared, 0)).toEqual([{ fieldIndex: 1, value: 10 }])
    expect(getBraneLocalValues(prepared, 1)).toEqual([{ fieldIndex: 1, value: 20 }])
    expect(getBraneSharedBlockIds(prepared, 0)).toEqual([0])
    expect(getBraneSharedBlockIds(prepared, 1)).toEqual([0])
  })

  test("boundary валидирует projection и не materializes расходящиеся shared values", () => {
    const data: Data = {
      fields: [{ type: FieldType.F32 }],
      branes: [
        { values: [[0, 100]], state: 0, collapses: [[null]] },
        { values: [[0, 50]], state: 0, collapses: [[null]] },
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
    }

    expect(() => prepareData(data)).toThrow("values diverge across branes")
  })

  test("legacy fieldIndices-only shorthand is rejected", () => {
    const data: Data = {
      fields: [
        { type: FieldType.F32 },
        { type: FieldType.F32 },
      ],
      branes: [
        { values: [[0, 100], [1, 10]], state: 0, collapses: [[null]] },
        { values: [[0, 100], [1, 20]], state: 0, collapses: [[null]] },
      ],
      entanglement: {
        blocks: [
          {
            braneIndices: [0, 1],
          } as any,
        ],
      },
    }

    expect(() => prepareData(data)).toThrow("requires at least 1 field")
  })
})
