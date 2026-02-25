import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../../src/index"

describe("Boundary - тип STRING (строка) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  // Тип STRING использует интернирование через StringAtlas.
  // Строки хранятся как [stringId, hash] для быстрого сравнения на GPU.

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно указанному", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { eq: "hero" } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.STRING_PTR }]],
        branes: [
          { state: "IDLE", params: [[0, "hero"]], superposition },
          { state: "IDLE", params: [[0, "monster"]], superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { neq: "enemy" } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.STRING_PTR }]],
        branes: [
          { state: "IDLE", params: [[0, "enemy"]], superposition },
          { state: "IDLE", params: [[0, "ally"]], superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { in: ["warrior", "mage", "rogue"] } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.STRING_PTR }]],
        branes: [
          { state: "IDLE", params: [[0, "warrior"]], superposition },
          { state: "IDLE", params: [[0, "mage"]], superposition },
          { state: "IDLE", params: [[0, "healer"]], superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { in: ["warrior", "mage"] } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.STRING_PTR }]],
        branes: [{ state: "IDLE", params: [[0, "healer"]], superposition }],
      })

      boundary.updateBraneField(0, 0, "warrior")
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен выполнить переход, если значение не в списке", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { notIn: ["enemy", "boss"] } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.STRING_PTR }]],
        branes: [
          { state: "IDLE", params: [[0, "enemy"]], superposition },
          { state: "IDLE", params: [[0, "boss"]], superposition },
          { state: "IDLE", params: [[0, "ally"]], superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { eq: "" } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.STRING_PTR }]],
        branes: [
          { state: "IDLE", params: [[0, ""]], superposition },
          { state: "IDLE", params: [[0, "hero"]], superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { eq: "test-123_@#" } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.STRING_PTR }]],
        branes: [
          { state: "IDLE", params: [[0, "test-123_@#"]], superposition },
          { state: "IDLE", params: [[0, "test-123"]], superposition },
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
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { eq: "Hero" } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.STRING_PTR }]],
        branes: [
          { state: "IDLE", params: [[0, "Hero"]], superposition },
          { state: "IDLE", params: [[0, "hero"]], superposition },
          { state: "IDLE", params: [[0, "HERO"]], superposition },
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