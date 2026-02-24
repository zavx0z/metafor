import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU } from "../../src/index"

describe("Boundary - тип BOOLEAN (логический) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  describe("Прямое значение true", () => {
    test("должен выполнить переход, когда значение равно true", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", params: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", params: { isAlive: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Прямое значение false", () => {
    test("должен выполнить переход, когда значение равно false", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { DEAD: { isAlive: false } },
        DEAD: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", params: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", params: { isAlive: true }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно true", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { isAlive: { eq: true } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", params: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", params: { isAlive: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("должен выполнить переход, когда значение равно false", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { DEAD: { isAlive: { eq: false } } },
        DEAD: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", params: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", params: { isAlive: true }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно true", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { DEAD: { isAlive: { neq: true } } },
        DEAD: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", params: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", params: { isAlive: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("DEAD")
    })

    test("должен выполнить переход, когда значение не равно false", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { isAlive: { neq: false } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", params: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", params: { isAlive: true }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
    })
  })

  describe("Множественные логические условия", () => {
    test("должен выполнить переход, когда все условия выполнены (И)", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { isAlive: true, hasMana: true } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" }, hasMana: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", params: { isAlive: true, hasMana: true }, superposition },
          { id: "q2", state: "IDLE", params: { isAlive: true, hasMana: false }, superposition },
          { id: "q3", state: "IDLE", params: { isAlive: false, hasMana: true }, superposition },
          { id: "q4", state: "IDLE", params: { isAlive: false, hasMana: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
      expect(states[3]).toBe("IDLE")
    })

    test("должен выполнить переход с разными комбинациями логических значений", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { isAlive: true, isStunned: false } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" }, isStunned: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", params: { isAlive: true, isStunned: false }, superposition },
          { id: "q2", state: "IDLE", params: { isAlive: true, isStunned: true }, superposition },
          { id: "q3", state: "IDLE", params: { isAlive: false, isStunned: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Обновление логических значений", () => {
    test("должен выполнить переход после обновления значения на true", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { isReady: true } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: { isReady: { type: "boolean" } },
        branes: [{ id: "q1", state: "IDLE", params: { isReady: false }, superposition }],
      })

      boundary.updateBraneField(0, "isReady", true)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })

    test("должен выполнить переход после обновления значения на false", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { DEAD: { isAlive: false } },
        DEAD: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" } },
        branes: [{ id: "q1", state: "IDLE", params: { isAlive: true }, superposition }],
      })

      boundary.updateBraneField(0, "isAlive", false)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
    })
  })

  describe("Смешанные условия (логическое + число)", () => {
    test("должен выполнить переход, когда оба условия разных типов выполнены", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { COMBAT: { isAlive: true, hp: { gt: 50 } } },
        COMBAT: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" }, hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { isAlive: true, hp: 100 }, superposition },
          { id: "q2", state: "IDLE", params: { isAlive: true, hp: 30 }, superposition },
          { id: "q3", state: "IDLE", params: { isAlive: false, hp: 100 }, superposition },
          { id: "q4", state: "IDLE", params: { isAlive: false, hp: 30 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("COMBAT")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
      expect(states[3]).toBe("IDLE")
    })
  })
})
