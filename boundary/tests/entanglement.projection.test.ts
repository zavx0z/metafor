import { describe, expect, test } from "bun:test"
import { prepareData } from "../boundary"
import { FieldType, type Data } from "../fields/index.t"

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
    const [firstPtr, secondPtr] = prepared.blockPtrs

    expect(prepared.heap[firstPtr!]!).toBe(1)
    expect(prepared.heap[firstPtr! + 1]!).toBe(0)
    expect(prepared.heap[secondPtr!]!).toBe(1)
    expect(prepared.heap[secondPtr! + 1]!).toBe(0)
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
    const [firstPtr, secondPtr] = prepared.blockPtrs

    expect(prepared.heap[firstPtr!]!).toBe(1)
    expect(prepared.heap[firstPtr! + 1]!).toBe(1)
    expect(prepared.heap[secondPtr!]!).toBe(1)
    expect(prepared.heap[secondPtr! + 1]!).toBe(1)
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
