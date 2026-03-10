/**
 * Тесты для prepareData.
 */
import { test, expect, describe } from "bun:test"
import { flattenBoundaryData, prepareData } from "../boundary"
import { FieldType, type Data } from "../fields/index.t"
import { OP } from "../fields/opcodes"

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

  test("должен подготовить flat JS store для 1 браны с 1 полем", () => {
    const result = prepareData({
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [[0, 100]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null]],
      }],
    })

    expect(result.fields).toEqual([{ type: FieldType.F32 }])
    expect(result.branes).toHaveLength(1)
    expect(result.sharedBlocks).toEqual([])
    expect(result.states).toEqual([0])
    expect(result.branes[0]?.localFields).toEqual([{ fieldIndex: 0, value: 100 }])
    expect(result.branes[0]?.transitions[0]?.[0]).toEqual({
      targetState: 1,
      conditions: [{ fieldIndex: 0, op: OP.GT, value: 50 }],
    })
  })

  test("должен подготовить данные с entanglement только из prepared projection", () => {
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
    expect(result.sharedBlocks[0]?.fields).toEqual([{ fieldIndex: 0, value: 100 }])
    expect(result.branes[0]?.localFields).toEqual([])
    expect(result.branes[1]?.localFields).toEqual([])
    expect(result.branes[0]?.sharedBlockIds).toEqual([0])
    expect(result.branes[1]?.sharedBlockIds).toEqual([0])
  })

  test("Fields должен дедуплицировать строки в canonical string table", () => {
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
          collapses: [[null]],
        },
      ],
    })

    expect(result.stringTable.filter((value) => value === "hello")).toHaveLength(1)
    expect(result.branes[0]?.localFields).toEqual([{ fieldIndex: 0, value: 1 }])
    expect(result.branes[1]?.localFields).toEqual([{ fieldIndex: 0, value: 1 }])
    expect(result.branes[0]?.transitions[0]?.[0]?.conditions).toEqual([
      { fieldIndex: 0, op: OP.EQ, value: 1 },
    ])
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

    expect(result.branes[0]?.localFields).toEqual([{ fieldIndex: 0, value: [1, 2, 3, 4, 5] }])
    expect(result.sharedBlocks).toEqual([])
  })
})
