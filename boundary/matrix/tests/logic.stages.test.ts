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
      // Начальные значения 0 не в [1,3,5], поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [
          { state: 0, params: [[0, 0]], collapses },
          { state: 0, params: [[0, 0]], collapses },
          { state: 0, params: [[0, 0]], collapses },
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: 1 }]]])
      expect(resultStates).toContainEqual([0, 1])  // Брана 0: 1 in [1,3,5] → переход
    })

    test("должен перейти, если float-значение в списке", async () => {
      const collapses: Collapse[][] = [
        [[1, { 0: { in: [36.6, 37.0] } }]],
        [null],
      ]
      // Начальные значения 0 не в [36.6,37.0], поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [
          { state: 0, params: [[0, 0]], collapses },
          { state: 0, params: [[0, 0]], collapses },
          { state: 0, params: [[0, 0]], collapses },
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: 36.6 }]]])
      expect(resultStates).toContainEqual([0, 1])  // Брана 0: 36.6 in [36.6,37.0] → переход
    })
  })

  describe("Оператор NOT_IN (Исключение)", () => {
    test("должен перейти, если значение НЕ в списке", async () => {
      const collapses: Collapse[][] = [
        [[1, { 0: { notIn: [0, 2] } }]],
        [null],
        [null],
      ]
      // Начальное значение 0 в [0,2], поэтому notIn:FALSE → НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [
          { state: 0, params: [[0, 0]], collapses },
          { state: 0, params: [[0, 0]], collapses },
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: 1 }]]])
      expect(resultStates).toContainEqual([0, 1])  // Брана 0: 1 notIn [0,2] → переход
    })
  })

  describe("Комбинированные условия", () => {
    test("должен работать с комбинацией диапазонов и списков", async () => {
      const collapses: Collapse[][] = [
        [[1, { 0: { gte: 100 }, 1: { in: [5, 7, 10] } }]],
        [null],
        [null],
      ]
      // Начальные значения hp=0,mana=0 не удовлетворяют условиям, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.F32 }, { type: FieldType.F32 }],
        branes: [
          { state: 0, params: [[0, 0], [1, 0]], collapses },
          { state: 0, params: [[0, 0], [1, 0]], collapses },
          { state: 0, params: [[0, 0], [1, 0]], collapses },
        ],
      })
      const resultStates = await update([[0, [
        { fieldIndex: 0, value: 150 },  // hp=150>=100
        { fieldIndex: 1, value: 5 },    // mana=5 in [5,7,10] → переход
      ]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })
})
