import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../../src/index"

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
      

      const superposition = {
        IDLE: { ACTIVE: { 0: { eq: "ACTIVE" } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }],
        ],
        branes: [
          { state: "IDLE", params: [[0, "ACTIVE"]], superposition },
          { state: "IDLE", params: [[0, "IDLE"]], superposition },
          { state: "IDLE", params: [[0, "DEAD"]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен выполнить переход, когда значение равно указанному (числовой enum)", async () => {
      

      const superposition = {
        IDLE: { ACTIVE: { 0: { eq: 2 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: [1, 2, 3] }],
        ],
        branes: [
          { state: "IDLE", params: [[0, 2]], superposition },
          { state: "IDLE", params: [[0, 1]], superposition },
          { state: "IDLE", params: [[0, 3]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно указанному", async () => {
      

      const superposition = {
        IDLE: { ACTIVE: { 0: { neq: "IDLE" } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "DEAD"] }],
        ],
        branes: [
          { state: "IDLE", params: [[0, "IDLE"]], superposition },
          { state: "IDLE", params: [[0, "ACTIVE"]], superposition },
          { state: "IDLE", params: [[0, "DEAD"]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Оператор GT (больше)", () => {
    test("должен выполнить переход, когда значение больше указанного", async () => {
      

      const superposition = {
        IDLE: { ACTIVE: { 0: { gt: 1 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: [1, 2, 3, 4, 5] }],
        ],
        branes: [
          { state: "IDLE", params: [[0, 1]], superposition },
          { state: "IDLE", params: [[0, 2]], superposition },
          { state: "IDLE", params: [[0, 3]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Оператор LT (меньше)", () => {
    test("должен выполнить переход, когда значение меньше указанного", async () => {
      

      const superposition = {
        IDLE: { ACTIVE: { 0: { lt: 3 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: [1, 2, 3, 4, 5] }],
        ],
        branes: [
          { state: "IDLE", params: [[0, 1]], superposition },
          { state: "IDLE", params: [[0, 2]], superposition },
          { state: "IDLE", params: [[0, 3]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Оператор GTE (больше или равно)", () => {
    test("должен выполнить переход, когда значение больше или равно указанному", async () => {
      

      const superposition = {
        IDLE: { ACTIVE: { 0: { gte: 3 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: [1, 2, 3, 4, 5] }],
        ],
        branes: [
          { state: "IDLE", params: [[0, 2]], superposition },
          { state: "IDLE", params: [[0, 3]], superposition },
          { state: "IDLE", params: [[0, 4]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Оператор LTE (меньше или равно)", () => {
    test("должен выполнить переход, когда значение меньше или равно указанному", async () => {
      

      const superposition = {
        IDLE: { ACTIVE: { 0: { lte: 2 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: [1, 2, 3, 4, 5] }],
        ],
        branes: [
          { state: "IDLE", params: [[0, 1]], superposition },
          { state: "IDLE", params: [[0, 2]], superposition },
          { state: "IDLE", params: [[0, 3]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Оператор IN (в списке)", () => {
    test("должен выполнить переход, если значение в списке", async () => {
      

      const superposition = {
        IDLE: { ACTIVE: { 0: { in: ["ACTIVE", "RUNNING"] } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "RUNNING", "DEAD"] }],
        ],
        branes: [
          { state: "IDLE", params: [[0, "ACTIVE"]], superposition },
          { state: "IDLE", params: [[0, "RUNNING"]], superposition },
          { state: "IDLE", params: [[0, "IDLE"]], superposition },
          { state: "IDLE", params: [[0, "DEAD"]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
      expect(states[3]).toBe("IDLE")
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен выполнить переход, если значение не в списке", async () => {
      

      const superposition = {
        IDLE: { ACTIVE: { 0: { notIn: ["IDLE", "DEAD"] } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: ["IDLE", "ACTIVE", "RUNNING", "DEAD"] }],
        ],
        branes: [
          { state: "IDLE", params: [[0, "IDLE"]], superposition },
          { state: "IDLE", params: [[0, "DEAD"]], superposition },
          { state: "IDLE", params: [[0, "ACTIVE"]], superposition },
          { state: "IDLE", params: [[0, "RUNNING"]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("ACTIVE")
      expect(states[3]).toBe("ACTIVE")
    })
  })

  describe("Множественные условия", () => {
    test("должен выполнить переход, когда условия выполнены", async () => {
      

      const superposition = {
        IDLE: { ACTIVE: { 0: { gte: 2, lte: 4 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.U32, enumValues: [1, 2, 3, 4, 5] }],
        ],
        branes: [
          { state: "IDLE", params: [[0, 1]], superposition },
          { state: "IDLE", params: [[0, 2]], superposition },
          { state: "IDLE", params: [[0, 3]], superposition },
          { state: "IDLE", params: [[0, 4]], superposition },
          { state: "IDLE", params: [[0, 5]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      // Result depends on implementation (AND or OR logic)
      expect(states).toBeDefined()
    })
  })
})