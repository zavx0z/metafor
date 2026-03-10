/**
 * Тесты для prepareData.
 */
import { test, expect, describe } from "bun:test"
import { flattenBoundaryData, prepareData } from "../boundary"
import { FieldType, type Data } from "../fields/index.t"
import { OP } from "../fields/opcodes"

describe("prepareData — подготовка общих данных выполнения", () => {
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

  test("должен подготовить данные для 1 браны с 1 полем", () => {
    const data: Data = {
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [[0, 100]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null]],
      }],
    }
    const result = prepareData(data)

    expect(result.heap).toBeInstanceOf(Uint32Array)
    expect(result.heap.length).toBeGreaterThan(0)
    expect(result.bytecode).toBeInstanceOf(Uint32Array)
    expect(result.states).toHaveLength(1)
  })

  test("должен подготовить данные с entanglement только из prepared projection", () => {
    const data: Data = {
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          values: [[0, 100]],
          state: 0,
          collapses: [[null]],
        },
        {
          values: [[0, 100]], // одинаковое значение → entangled
          state: 0,
          collapses: [[null]],
        },
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
    const result = prepareData(data)

    expect(result.heap).toBeInstanceOf(Uint32Array)
    expect(result.blockPtrs).toHaveLength(2)
  })

  test("Fields должен дедуплицировать строки в canonical string table", () => {
    const data: Data = {
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
    }
    const result = prepareData(data)

    expect(result.heap).toBeInstanceOf(Uint32Array)
    expect(result.blockPtrs).toHaveLength(2)
    expect(result.stringTable.values.filter((value) => value === "hello")).toHaveLength(1)
  })

  test("должен рассчитать arrayReserveSize для ARRAY полей", () => {
    const data: Data = {
      fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
      branes: [
        {
          values: [[0, [1, 2, 3, 4, 5]]], // массив из 5 элементов
          state: 0,
          collapses: [[null]],
        },
      ],
    }
    const result = prepareData(data)

    expect(result.arrayReserveSize).toBeGreaterThan(0)
    expect(result.heap.length).toBeGreaterThan(result.blockPtrs[0]!)
  })
})
