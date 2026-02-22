import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../../../../fixture/bunWebGPU"
import { Boundary } from "../../../src/index"

describe("Boundary - тип FLOAT (число) с bun-webgpu", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно указанному", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 42 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 42 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 41 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 43 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен работать с отрицательными числами", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { eq: -10 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: -10 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 10 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("должен работать с дробными числами", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 3.14 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 3.14 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 3.15 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("должен работать с нулём", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 0 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 0 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 0.001 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно указанному", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { neq: 42 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 42 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 41 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 43 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })

    test("должен работать с алиасом 'ne'", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { ne: 0 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 0 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 1 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
    })

    test("должен работать с алиасом 'notEq'", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notEq: 100 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 99 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
    })
  })

  describe("Оператор GT (больше)", () => {
    test("должен выполнить переход, когда значение больше указанного", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { gt: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 49 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен работать с отрицательными числами", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { gt: -10 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: -5 }, superposition },
          { id: "q2", state: "IDLE", params: { value: -10 }, superposition },
          { id: "q3", state: "IDLE", params: { value: -15 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Оператор LT (меньше)", () => {
    test("должен выполнить переход, когда значение меньше указанного", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { lt: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен работать с отрицательными числами", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { lt: -5 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: -10 }, superposition },
          { id: "q2", state: "IDLE", params: { value: -5 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 0 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Оператор GTE (больше или равно)", () => {
    test("должен выполнить переход, когда значение больше или равно указанному", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { gte: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 49 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Оператор LTE (меньше или равно)", () => {
    test("должен выполнить переход, когда значение меньше или равно указанному", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { lte: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { in: [10, 20, 30] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 10 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 20 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 30 }, superposition },
          { id: "q4", state: "IDLE", params: { value: 15 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
      expect(states[3]).toBe("IDLE")
    })

    test("должен работать с пустым списком", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { in: [] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [{ id: "q1", state: "IDLE", params: { value: 10 }, superposition }],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен выполнить переход, если значение не в списке", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notIn: [10, 20, 30] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 10 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 15 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 25 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Составные условия (between)", () => {
    test("должен выполнить переход, если значение в диапазоне", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { between: [10, 20] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 9 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 10 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 15 }, superposition },
          { id: "q4", state: "IDLE", params: { value: 20 }, superposition },
          { id: "q5", state: "IDLE", params: { value: 21 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
      expect(states[3]).toBe("ACTIVE")
      expect(states[4]).toBe("IDLE")
    })
  })

  describe("Отрицательные условия (notGt, notGte, notLt, notLte)", () => {
    test("notGt должен быть эквивалентен lte", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notGt: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })

    test("notGte должен быть эквивалентен lt", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notGte: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("notLt должен быть эквивалентен gte", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notLt: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })

    test("notLte должен быть эквивалентен gt", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notLte: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Множественные условия", () => {
    test("должен выполнить переход, когда все условия для одного поля выполнены (логика И)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { gte: 10, lte: 20 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 9 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 15 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 21 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })
})