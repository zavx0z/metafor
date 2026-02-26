import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../../src/index"
import type { NumericSuperposition } from "../../src/index.t"

describe("Boundary - тип UINT (enum) с bun-webgpu", () => {
  let boundary: Boundary

  beforeAll(async () => {
    GPU._device = await setupDevice()
    boundary = new Boundary()
  })

  afterEach(() => {
    boundary.clear()
  })

  // ПРИМЕЧАНИЕ: Значения enum хранятся как индексы в массиве значений.
  // Сравнения GT/LT/GTE/LTE работают с индексами, а не со значениями.

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно указанному (строковый enum)", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: "ACTIVE" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }]],
        branes: [
          { state: 0, params: [[0, "ACTIVE"]], superposition },
          { state: 0, params: [[0, "IDLE"]], superposition },
          { state: 0, params: [[0, "DEAD"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[2]).toBe(0)  // IDLE (индекс 0)
    })

    test("должен выполнить переход, когда значение равно указанному (числовой enum)", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: 2 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.U32, enumValues: [1, 2, 3] }]],
        branes: [
          { state: 0, params: [[0, 2]], superposition },
          { state: 0, params: [[0, 1]], superposition },
          { state: 0, params: [[0, 3]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[2]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно указанному", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { neq: "IDLE" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }]],
        branes: [
          { state: 0, params: [[0, "IDLE"]], superposition },
          { state: 0, params: [[0, "ACTIVE"]], superposition },
          { state: 0, params: [[0, "DEAD"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[1]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[2]).toBe(1)  // ACTIVE (индекс 1)
    })
  })

  describe("Оператор GT (больше)", () => {
    test("должен выполнить переход, когда значение больше указанного", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: "ACTIVE" } } }],  // индекс > 1 ("ACTIVE")
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }]],
        branes: [
          { state: 0, params: [[0, "DEAD"]], superposition },   // индекс 2 > 1
          { state: 0, params: [[0, "IDLE"]], superposition },    // индекс 0 не > 1
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор LT (меньше)", () => {
    test("должен выполнить переход, когда значение меньше указанного", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lt: "ACTIVE" } } }],  // индекс < 1 ("ACTIVE")
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }]],
        branes: [
          { state: 0, params: [[0, "IDLE"]], superposition },   // индекс 0 < 1
          { state: 0, params: [[0, "DEAD"]], superposition },    // индекс 2 не < 1
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор GTE (больше или равно)", () => {
    test("должен выполнить переход, когда значение больше или равно указанному", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gte: "ACTIVE" } } }],  // индекс >= 1 ("ACTIVE")
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }]],
        branes: [
          { state: 0, params: [[0, "ACTIVE"]], superposition },  // индекс 1 >= 1
          { state: 0, params: [[0, "IDLE"]], superposition },    // индекс 0 не >= 1
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор LTE (меньше или равно)", () => {
    test("должен выполнить переход, когда значение меньше или равно указанному", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lte: "ACTIVE" } } }],  // индекс <= 1 ("ACTIVE")
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }]],
        branes: [
          { state: 0, params: [[0, "IDLE"]], superposition },    // индекс 0 <= 1
          { state: 0, params: [[0, "DEAD"]], superposition },    // индекс 2 не <= 1
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор IN (в списке)", () => {
    test("должен выполнить переход, если значение в списке", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { in: ["ACTIVE", "DEAD"] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }]],
        branes: [
          { state: 0, params: [[0, "ACTIVE"]], superposition },
          { state: 0, params: [[0, "IDLE"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен выполнить переход, если значение не в списке", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { notIn: ["IDLE"] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }]],
        branes: [
          { state: 0, params: [[0, "ACTIVE"]], superposition },
          { state: 0, params: [[0, "IDLE"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Множественные условия", () => {
    test("должен выполнить переход, когда условия выполнены", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: { gt: "IDLE" },    // enum индекс > 0 (ACTIVE или DEAD)
                1: { lt: "DEAD" },    // enum индекс < 2 (не DEAD)
              },
            },
          ],
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }],
          [1, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }],
        ],
        branes: [
          { state: 0, params: [[0, "ACTIVE"], [1, "ACTIVE"]], superposition },  // 1>0 И 1<2
          { state: 0, params: [[0, "IDLE"], [1, "IDLE"]], superposition },      // 0 не > 0
          { state: 0, params: [[0, "DEAD"], [1, "DEAD"]], superposition },      // 2 не < 2
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[2]).toBe(0)  // IDLE (индекс 0)
    })
  })
})
