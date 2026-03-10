/**
 * Тесты для prepareData.
 */
import { test, expect, describe, beforeEach } from "bun:test"
import { prepareData } from "../boundary"
import { resetStringAtlas } from "../atlas"
import { FieldType, type Data } from "../fields/index.t"

describe("prepareData — подготовка данных для GPU", () => {
  beforeEach(() => {
    resetStringAtlas()
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

    expect(result.heapData).toBeInstanceOf(Uint32Array)
    expect(result.heapData.length).toBeGreaterThan(0)
    expect(result.compiledRules.bytecode).toBeInstanceOf(Uint32Array)
    expect(result.initialStates).toHaveLength(1)
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

    expect(result.heapData).toBeInstanceOf(Uint32Array)
    expect(result.heapLayout.blockPtrs).toHaveLength(2)
  })

  test("должен интернировать строки через StringAtlas", () => {
    const data: Data = {
      fields: [{ type: FieldType.STRING_PTR }],
      branes: [
        {
          values: [[0, "hello"]],
          state: 0,
          collapses: [[null]],
        },
      ],
    }
    const result = prepareData(data)

    expect(result.heapData).toBeInstanceOf(Uint32Array)
    expect(result.heapLayout.blockPtrs).toHaveLength(1)
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
    expect(result.heapData.length).toBeGreaterThan(result.heapLayout.blockPtrs[0]!)
  })
})
