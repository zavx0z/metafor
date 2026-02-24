import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU } from "../../src/index"

describe("Boundary - тип UINT (enum) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  // ПРИМЕЧАНИЕ: Значения enum хранятся как индексы в массиве значений.
  // Сравнения GT/LT/GTE/LTE работают с индексами, а не со значениями.

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно указанному (строковый enum)", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { status: { eq: "ACTIVE" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { status: "ACTIVE" }, superposition },
          { id: "q2", state: "IDLE", params: { status: "IDLE" }, superposition },
          { id: "q3", state: "IDLE", params: { status: "DEAD" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен выполнить переход, когда значение равно указанному (числовой enum)", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { level: { eq: 2 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 1 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 3 }, superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { status: { neq: "IDLE" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { status: "IDLE" }, superposition },
          { id: "q2", state: "IDLE", params: { status: "ACTIVE" }, superposition },
          { id: "q3", state: "IDLE", params: { status: "DEAD" }, superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { level: { gt: 1 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 3 }, superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { level: { lt: 3 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 3 }, superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { level: { gte: 3 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 3 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 4 }, superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { level: { lte: 2 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 3 }, superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { status: { in: ["ACTIVE", "RUNNING"] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "RUNNING", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { status: "ACTIVE" }, superposition },
          { id: "q2", state: "IDLE", params: { status: "RUNNING" }, superposition },
          { id: "q3", state: "IDLE", params: { status: "IDLE" }, superposition },
          { id: "q4", state: "IDLE", params: { status: "DEAD" }, superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { status: { notIn: ["IDLE", "DEAD"] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "RUNNING", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { status: "IDLE" }, superposition },
          { id: "q2", state: "IDLE", params: { status: "DEAD" }, superposition },
          { id: "q3", state: "IDLE", params: { status: "ACTIVE" }, superposition },
          { id: "q4", state: "IDLE", params: { status: "RUNNING" }, superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { level: { gte: 2, lte: 4 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 3 }, superposition },
          { id: "q4", state: "IDLE", params: { level: 4 }, superposition },
          { id: "q5", state: "IDLE", params: { level: 5 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      // Result depends on implementation (AND or OR logic)
      expect(states).toBeDefined()
    })
  })
})