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
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: "hero" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { state: 0, params: [[0, "hero"]], superposition },
          { state: 0, params: [[0, "monster"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно указанному", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { neq: "enemy" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { state: 0, params: [[0, "enemy"]], superposition },
          { state: 0, params: [[0, "ally"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[1]).toBe(1)  // ACTIVE (индекс 1)
    })
  })

  describe("Оператор IN (в списке)", () => {
    test("должен выполнить переход, если значение в списке", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { in: ["warrior", "mage"] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { state: 0, params: [[0, "warrior"]], superposition },
          { state: 0, params: [[0, "mage"]], superposition },
          { state: 0, params: [[0, "healer"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[2]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Обновление строковых значений", () => {
    test("должен корректно применить обновление строки и обработать IN", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { in: ["healer", "mage"] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [{ state: 0, params: [[0, "warrior"]], superposition }],
      })

      boundary.updateBraneField(0, 0, "healer")
      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен выполнить переход, если значение не в списке", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { notIn: ["enemy", "boss"] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { state: 0, params: [[0, "enemy"]], superposition },
          { state: 0, params: [[0, "boss"]], superposition },
          { state: 0, params: [[0, "ally"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[2]).toBe(1)  // ACTIVE (индекс 1)
    })
  })

  describe("Пустые строки", () => {
    test("должен корректно обрабатывать пустую строку", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: "" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { state: 0, params: [[0, ""]], superposition },
          { state: 0, params: [[0, "hero"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Специальные символы", () => {
    test("должен корректно обрабатывать строки со специальными символами", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: "test-123_@" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { state: 0, params: [[0, "test-123_@"]], superposition },
          { state: 0, params: [[0, "test-123"]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Чувствительность к регистру", () => {
    test("должен быть чувствительным к регистру при сравнении", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: "Hero" } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.STRING_PTR }]],
        branes: [
          { state: 0, params: [[0, "Hero"]], superposition },
          { state: 0, params: [[0, "hero"]], superposition },
          { state: 0, params: [[0, "HERO"]], superposition },
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
