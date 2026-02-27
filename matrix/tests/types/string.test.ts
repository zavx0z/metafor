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
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("не должен выполнить переход, когда значение не равно", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: "hero" } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [{ state: 0, params: [[0, ""]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "monster" }]]])
      expect(resultStates[0]?.[1]).toBe(0)
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно указанному", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { neq: "hero" } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [{ state: 0, params: [[0, ""]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "monster" }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })

  describe("Оператор IN (список строк)", () => {
    test("должен выполнить переход, когда строка в списке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { in: ["hero", "mage", "rogue"] } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [
          { state: 0, params: [[0, "alpha"]], collapses },  // будет "hero"
          { state: 0, params: [[0, "beta"]], collapses },   // будет "warrior" (не в списке)
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "hero" }]]])
      expect(resultStates[0]?.[1]).toBe(1)  // "hero" in ["hero","mage","rogue"] → transition
      expect(resultStates[1]?.[1]).toBe(0)  // "beta" not in list → no transition
    })

    test("должен работать с Unicode строками в списке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { in: ["привет", "мир", "тест"] } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [{ state: 0, params: [[0, ""]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "мир" }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("должен работать с эмодзи в списке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { in: ["👍", "😂", "❤️"] } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [{ state: 0, params: [[0, ""]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "😂" }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })

  describe("Оператор NOT_IN (исключение строк)", () => {
    test("должен выполнить переход, когда строка НЕ в списке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { notIn: ["hero", "mage"] } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [
          { state: 0, params: [[0, "alpha"]], collapses },  // будет "rogue" (not in list)
          { state: 0, params: [[0, "hero"]], collapses },   // hero (in list, no transition)
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "rogue" }]]])
      // Брана 0: "rogue" not in ["hero","mage"] → transition to 1
      // Брана 1: "hero" in ["hero","mage"] → NOT_IN false → no transition
      expect(resultStates[0]?.[1]).toBe(1)
      expect(resultStates[1]?.[1]).toBe(0)  // "hero" in list → NOT_IN false → no transition
    })
  })

  describe("Интернирование строк", () => {
    test("должен интернировать одинаковые строки в один ID", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: "test" } }]], [null]]
      await write({
        fields: [{ type: FieldType.STRING_PTR }],
        branes: [
          { state: 0, params: [[0, ""]], collapses },
          { state: 0, params: [[0, ""]], collapses },
        ],
      })
      // Обновляем обе браны одинаковой строкой
      await update([[0, [{ fieldIndex: 0, value: "test" }]]])
      const resultStates = await update([[1, [{ fieldIndex: 0, value: "test" }]]])
      expect(resultStates[0]?.[1]).toBe(1)
      expect(resultStates[1]?.[1]).toBe(1)
    })
  })
})
