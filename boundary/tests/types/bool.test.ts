import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../../src/index"
import type { NumericSuperposition } from "../../src/index.t"

describe("Boundary - тип BOOLEAN (логический) с bun-webgpu", () => {
  let boundary: Boundary

  beforeAll(async () => {
    GPU._device = await setupDevice()
    boundary = new Boundary()
  })

  afterEach(() => {
    boundary.clear()
  })

  describe("Прямое значение", () => {
    test("должен выполнить переход, когда значение равно true", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: true } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [
          { state: 0, params: [[0, true]], superposition },
          { state: 0, params: [[0, false]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })

    test("должен выполнить переход, когда значение равно false", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: false } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [
          { state: 0, params: [[0, false]], superposition },
          { state: 0, params: [[0, true]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно true", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: true } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [
          { state: 0, params: [[0, true]], superposition },
          { state: 0, params: [[0, false]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })

    test("должен выполнить переход, когда значение равно false", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: false } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [
          { state: 0, params: [[0, false]], superposition },
          { state: 0, params: [[0, true]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно true", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { neq: true } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [
          { state: 0, params: [[0, true]], superposition },
          { state: 0, params: [[0, false]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[1]).toBe(1)  // ACTIVE (индекс 1)
    })

    test("должен выполнить переход, когда значение не равно false", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { neq: false } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [
          { state: 0, params: [[0, false]], superposition },
          { state: 0, params: [[0, true]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[1]).toBe(1)  // ACTIVE (индекс 1)
    })
  })

  describe("Множественные логические условия", () => {
    test("должен выполнить переход, когда все условия выполнены (И)", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: true,       // flag1 === true
                1: { eq: true }, // flag2 === true
              },
            },
          ],
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.BOOL }],
          [1, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: 0, params: [[0, true], [1, true]], superposition },
          { state: 0, params: [[0, true], [1, false]], superposition },
          { state: 0, params: [[0, false], [1, true]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[2]).toBe(0)  // IDLE (индекс 0)
    })

    test("должен выполнить переход с разными комбинациями логических значений", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: true,
                1: false,
              },
            },
          ],
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.BOOL }],
          [1, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: 0, params: [[0, true], [1, false]], superposition },
          { state: 0, params: [[0, false], [1, true]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Обновление логических значений", () => {
    test("должен выполнить переход после обновления значения на true", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: true } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [{ state: 0, params: [[0, false]], superposition }],
      })

      boundary.updateBraneField(0, 0, true)
      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
    })

    test("должен выполнить переход после обновления значения на false", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: false } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [{ state: 0, params: [[0, true]], superposition }],
      })

      boundary.updateBraneField(0, 0, false)
      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
    })
  })

  describe("Смешанные условия (логическое + число)", () => {
    test("должен выполнить переход, когда оба условия разных типов выполнены", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: { gt: 50 },   // hp > 50
                1: true,         // isAlive === true
              },
            },
          ],
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: 0, params: [[0, 100], [1, true]], superposition },
          { state: 0, params: [[0, 100], [1, false]], superposition },
          { state: 0, params: [[0, 30], [1, true]], superposition },
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
