import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../../src/index"
import type { NumericSuperposition } from "../../src/index.t"

describe("Boundary - тип STRING (строка) с bun-webgpu", () => {
  let boundary: Boundary

  beforeAll(async () => {
    GPU._device = await setupDevice()
    boundary = new Boundary()
  })

  afterEach(() => {
    boundary.clear()
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно указанному", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: "hero" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, "hero"]], superposition },
          { initialStateIndex: 0, states, params: [[0, "monster"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно указанному", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { neq: "enemy" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, "enemy"]], superposition },
          { initialStateIndex: 0, states, params: [[0, "ally"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("ACTIVE")
    })
  })

  describe("Оператор IN (в списке)", () => {
    test("должен выполнить переход, если значение в списке", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { in: ["warrior", "mage"] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, "warrior"]], superposition },
          { initialStateIndex: 0, states, params: [[0, "mage"]], superposition },
          { initialStateIndex: 0, states, params: [[0, "healer"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("IDLE")
    })
  })

  describe("Обновление строковых значений", () => {
    test("должен корректно применить обновление строки и обработать IN", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { in: ["healer", "mage"] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [{ initialStateIndex: 0, states, params: [[0, "warrior"]], superposition }],
      })

      boundary.updateBraneField(0, 0, "healer")
      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен выполнить переход, если значение не в списке", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { notIn: ["enemy", "boss"] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, "enemy"]], superposition },
          { initialStateIndex: 0, states, params: [[0, "boss"]], superposition },
          { initialStateIndex: 0, states, params: [[0, "ally"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("IDLE")
      expect(resultStates[2]).toBe("ACTIVE")
    })
  })

  describe("Пустые строки", () => {
    test("должен корректно обрабатывать пустую строку", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: "" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, ""]], superposition },
          { initialStateIndex: 0, states, params: [[0, "hero"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
    })
  })

  describe("Специальные символы", () => {
    test("должен корректно обрабатывать строки со специальными символами", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: "test-123_@" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, "test-123_@"]], superposition },
          { initialStateIndex: 0, states, params: [[0, "test-123"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
    })
  })

  describe("Чувствительность к регистру", () => {
    test("должен быть чувствительным к регистру при сравнении", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: "Hero" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, "Hero"]], superposition },
          { initialStateIndex: 0, states, params: [[0, "hero"]], superposition },
          { initialStateIndex: 0, states, params: [[0, "HERO"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
      expect(resultStates[2]).toBe("IDLE")
    })
  })
})
