/**
 * Тесты логических операторов (IN, NOT_IN).
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { write, update, resetMatrix } from "../index"
import { GPU } from "../gpu/device"
import { FieldType, type Collapse } from "../index.t"
import { resetStringAtlas } from "../StringAtlas"

describe("matrix — Логические стадии (bun-webgpu)", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  describe("Оператор IN (Списки)", () => {
    test("должен перейти, если значение в списке (int/enum)", async () => {
      // Одна суперпозиция: из state 0 переходим в state 1 если value in [1, 3, 5]
      const collapses: Collapse[][] = [
        [[1, { 0: { in: [1, 3, 5] } }]],  // state 0 → state 1 если in [1,3,5]
        [null],  // state 1 терминальное
      ]
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [
          { state: 0, params: [[0, 1]], collapses },   // 1 in [1,3,5] → state 1
          { state: 0, params: [[0, 2]], collapses },   // 2 not in [1,3,5] → state 0
          { state: 0, params: [[0, 0]], collapses },   // 0 not in [1,3,5] → state 0
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: 1 }]]])
      expect(resultStates[0]?.[1]).toBe(1)
      expect(resultStates[1]?.[1]).toBe(0)
      expect(resultStates[2]?.[1]).toBe(0)
    })

    test("должен перейти, если float-значение в списке", async () => {
      const collapses: Collapse[][] = [
        [[1, { 0: { in: [36.6, 37.0] } }]],
        [null],
      ]
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [
          { state: 0, params: [[0, 36.6]], collapses },  // 36.6 in [36.6,37.0] → state 1
          { state: 0, params: [[0, 37.0]], collapses },  // 37.0 in [36.6,37.0] → state 1
          { state: 0, params: [[0, 40.0]], collapses },  // 40.0 not in [36.6,37.0] → state 0
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: 36.6 }]]])
      expect(resultStates[0]?.[1]).toBe(1)
      expect(resultStates[1]?.[1]).toBe(1)
      expect(resultStates[2]?.[1]).toBe(0)
    })
  })

  describe("Оператор NOT_IN (Исключение)", () => {
    test("должен перейти, если значение НЕ в списке", async () => {
      const collapses: Collapse[][] = [
        [[1, { 0: { notIn: [0, 2] } }]],
        [null],
        [null],
      ]
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [
          { state: 0, params: [[0, 1]], collapses },
          { state: 0, params: [[0, 0]], collapses },
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: 1 }]]])
      expect(resultStates[0]?.[1]).toBe(1)
      expect(resultStates[1]?.[1]).toBe(0)
    })
  })

  describe("Комбинированные условия", () => {
    test("должен работать с комбинацией диапазонов и списков", async () => {
      const collapses: Collapse[][] = [
        [[1, { 0: { gte: 100 }, 1: { in: [5, 7, 10] } }]],
        [null],
        [null],
      ]
      await write({
        fields: [{ type: FieldType.F32 }, { type: FieldType.F32 }],
        branes: [
          { state: 0, params: [[0, 150], [1, 5]], collapses },
          { state: 0, params: [[0, 150], [1, 1]], collapses },
          { state: 0, params: [[0, 50], [1, 7]], collapses },
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: 150 }]]])
      expect(resultStates[0]?.[1]).toBe(1)
      expect(resultStates[1]?.[1]).toBe(0)
      expect(resultStates[2]?.[1]).toBe(0)
    })
  })
})
