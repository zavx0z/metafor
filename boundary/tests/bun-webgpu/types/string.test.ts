import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../../fixture/bunWebGPU"
import { Boundary } from "../../../src/index"

describe("Boundary - тип STRING (строка) с bun-webgpu", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  // Тип STRING использует интернирование через StringAtlas.
  // Строки хранятся как [stringId, hash] для быстрого сравнения на GPU.

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно указанному", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "hero" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "hero" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "monster" }, superposition },
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
        IDLE: { ACTIVE: { name: { neq: "enemy" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "enemy" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "ally" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
    })
  })

  describe("Оператор IN (в списке)", () => {
    test("должен выполнить переход, если значение в списке", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { role: { in: ["warrior", "mage", "rogue"] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { role: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { role: "warrior" }, superposition },
          { id: "q2", state: "IDLE", fields: { role: "mage" }, superposition },
          { id: "q3", state: "IDLE", fields: { role: "healer" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Обновление строковых значений", () => {
    test("должен корректно применить обновление строки и обработать IN", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { role: { in: ["warrior", "mage"] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { role: { type: "string" } },
        branes: [{ id: "q1", state: "IDLE", fields: { role: "healer" }, superposition }],
      })

      boundary.updateBraneField(0, "role", "warrior")
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен выполнить переход, если значение не в списке", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { role: { notIn: ["enemy", "boss"] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { role: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { role: "enemy" }, superposition },
          { id: "q2", state: "IDLE", fields: { role: "boss" }, superposition },
          { id: "q3", state: "IDLE", fields: { role: "ally" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Пустые строки", () => {
    test("должен корректно обрабатывать пустую строку", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "hero" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Специальные символы", () => {
    test("должен корректно обрабатывать строки со специальными символами", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { code: { eq: "test-123_@#" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { code: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { code: "test-123_@#" }, superposition },
          { id: "q2", state: "IDLE", fields: { code: "test-123" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Чувствительность к регистру", () => {
    test("должен быть чувствительным к регистру при сравнении", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "Hero" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "Hero" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "hero" }, superposition },
          { id: "q3", state: "IDLE", fields: { name: "HERO" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })
})