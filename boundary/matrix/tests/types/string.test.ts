/**
 * Тесты для типа STRING.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { write, update, resetMatrix } from "../../index"
import { GPU } from "../../gpu/device"
import { FieldType, type Collapse } from "../../index.t"
import { resetStringAtlas } from "../../StringAtlas"

describe("matrix - тип STRING (строка) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно указанной строке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: "hero" } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [{ state: 0, params: [[0, ""]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "hero" }]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("не должен выполнить переход, когда значение не равно", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: "hero" } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [{ state: 0, params: [[0, ""]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "monster" }]]])
      expect(resultStates).toEqual([])
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно указанному", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { neq: "hero" } }]], [null]]
      // Начальное значение "hero" = "hero", поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [{ state: 0, params: [[0, "hero"]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "monster" }]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор IN (список строк)", () => {
    test("должен выполнить переход, когда строка в списке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { in: ["hero", "mage", "rogue"] } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [
          { state: 0, params: [[0, "alpha"]], collapses },
          { state: 0, params: [[0, "beta"]], collapses },
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "hero" }]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен работать с Unicode строками в списке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { in: ["привет", "мир", "тест"] } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [{ state: 0, params: [[0, ""]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "мир" }]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен работать с эмодзи в списке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { in: ["😀", "😂", "😍"] } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [{ state: 0, params: [[0, ""]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "😂" }]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор NOT_IN (исключение строк)", () => {
    test("должен выполнить переход, когда строка НЕ в списке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { notIn: ["hero", "mage", "rogue"] } }]], [null]]
      // Начальное значение "hero" в списке, поэтому notIn:FALSE → НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [
          { state: 0, params: [[0, "hero"]], collapses },
          { state: 0, params: [[0, "hero"]], collapses },
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "warrior" }]]])
      expect(resultStates).toContainEqual([0, 1])  // "warrior" notIn ["hero","mage","rogue"] → переход
    })
  })

  describe("Интернирование строк", () => {
    test("должен интернировать одинаковые строки в один ID", async () => {
      const collapses: Collapse[][] = [
        [[1, { 0: { eq: "test" } }]],
        [[1, { 0: { eq: "test" } }]],
      ]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [
          { state: 0, params: [[0, ""]], collapses },
          { state: 0, params: [[0, ""]], collapses },
        ],
      })
      const resultStates = await update([
        [0, [{ fieldIndex: 0, value: "test" }]],
        [1, [{ fieldIndex: 0, value: "test" }]],
      ])
      expect(resultStates).toContainEqual([0, 1])
      expect(resultStates).toContainEqual([1, 1])
    })
  })
})
