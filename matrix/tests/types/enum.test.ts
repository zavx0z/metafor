/**
 * Тесты для типа UINT с enum.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { write, update, resetMatrix } from "../../index"
import { GPU } from "../../gpu/device"
import { FieldType, type Collapse } from "../../index.t"
import { resetStringAtlas } from "../../StringAtlas"

describe("matrix - тип UINT (enum) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  describe("Прямое значение enum", () => {
    test("должен выполнить переход, когда значение равно указанному enum", async () => {
      const collapses: Collapse[][] = [[[1, { 0: "MAGE" }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, params: [[0, "WARRIOR"]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "MAGE" }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("не должен выполнить переход, когда значение не равно enum", async () => {
      const collapses: Collapse[][] = [[[1, { 0: "MAGE" }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, params: [[0, "WARRIOR"]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "ROGUE" }]]])
      expect(resultStates[0]?.[1]).toBe(0)
    })
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно указанному enum", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: "WARRIOR" } }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, params: [[0, "ROGUE"]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "WARRIOR" }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно указанному enum", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { neq: "WARRIOR" } }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, params: [[0, "WARRIOR"]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "MAGE" }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })

  describe("Оператор IN (список enum)", () => {
    test("должен выполнить переход, когда enum в списке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { in: ["WARRIOR", "MAGE"] } }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }, { type: FieldType.U32 }],
        branes: [
          { state: 0, params: [[0, "WARRIOR"], [1, 0]], collapses },  // будет "WARRIOR" (in list)
          { state: 0, params: [[0, "ROGUE"], [1, 1]], collapses },    // останется "ROGUE" (not in list)
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "WARRIOR" }]]])
      expect(resultStates[0]?.[1]).toBe(1)  // "WARRIOR" in list → transition
      expect(resultStates[1]?.[1]).toBe(0)  // "ROGUE" not in list → no transition
    })

    test("должен работать с NOT_IN для enum", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { notIn: ["WARRIOR", "MAGE"] } }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [
          { state: 0, params: [[0, "WARRIOR"]], collapses },  // будет "ROGUE"
          { state: 0, params: [[0, "MAGE"]], collapses },     // будет "WARRIOR"
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "ROGUE" }]]])
      expect(resultStates[0]?.[1]).toBe(1)  // "ROGUE" not in ["WARRIOR","MAGE"] → transition
      expect(resultStates[1]?.[1]).toBe(0)  // "MAGE" stays → no transition
    })
  })

  describe("Сравнение индексов enum", () => {
    test("должен работать с GT для enum (сравнение индексов)", async () => {
      // WARRIOR=0, MAGE=1, ROGUE=2
      // gt: "MAGE" означает gt: 1 (индекс MAGE)
      const collapses: Collapse[][] = [[[1, { 0: { gt: "MAGE" } }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [
          { state: 0, params: [[0, "WARRIOR"]], collapses },  // будет "ROGUE" (2 > 1) → state 1
          { state: 0, params: [[0, "MAGE"]], collapses },     // будет "WARRIOR" (0 < 1) → state 0
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "ROGUE" }]]])
      expect(resultStates[0]?.[1]).toBe(1)  // ROGUE (2) > MAGE (1) → transition
      expect(resultStates[1]?.[1]).toBe(0)  // WARRIOR (0) < MAGE (1) → no transition
    })

    test("должен работать с LT для enum (сравнение индексов)", async () => {
      // WARRIOR=0, MAGE=1, ROGUE=2
      // lt: "ROGUE" означает lt: 2
      const collapses: Collapse[][] = [[[1, { 0: { lt: "ROGUE" } }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }, { type: FieldType.U32 }],
        branes: [
          { state: 0, params: [[0, "WARRIOR"], [1, 100]], collapses },  // будет "MAGE" (1 < 2)
          { state: 0, params: [[0, "ROGUE"], [1, 200]], collapses },    // останется "ROGUE" (2 not < 2)
        ],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: "MAGE" }]]])
      expect(resultStates[0]?.[1]).toBe(1)  // MAGE (1) < ROGUE (2) → transition
      expect(resultStates[1]?.[1]).toBe(0)  // "ROGUE" stays (2 not < 2) → no transition
    })
  })

  describe("Ошибка при неизвестном значении enum", () => {
    test("должен выбросить ошибку при неизвестном значении enum в условии", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: "UNKNOWN" } }]], [null]]
      // Ошибка должна быть выброшена на этапе компиляции (write)
      await expect(write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, params: [[0, "WARRIOR"]], collapses }],
      })).rejects.toThrow("not found in enum")
    })

    test("должен выбросить ошибку при неизвестном значении enum в update", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: "MAGE" } }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, params: [[0, "WARRIOR"]], collapses }],
      })
      // Ошибка должна быть выброшена при кодировании значения в update
      await expect(update([[0, [{ fieldIndex: 0, value: "UNKNOWN" }]]])).rejects.toThrow("not found in enum")
    })
  })
})
