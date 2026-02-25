import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../../src/index"
import { toNumericSuperposition } from "../numeric.helper"

describe("Boundary - тип FLOAT (число) с bun-webgpu", () => {
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { eq: 42 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 42]], superposition },
          { initialStateIndex: 0, params: [[0, 41]], superposition },
          { initialStateIndex: 0, params: [[0, 43]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен работать с отрицательными числами", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { eq: -10 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, -10]], superposition },
          { initialStateIndex: 0, params: [[0, 10]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("должен работать с дробными числами", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { eq: 3.14 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 3.14]], superposition },
          { initialStateIndex: 0, params: [[0, 3.15]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("должен работать с нулём", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { eq: 0 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 0]], superposition },
          { initialStateIndex: 0, params: [[0, 0.001]], superposition },
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { neq: 42 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 42]], superposition },
          { initialStateIndex: 0, params: [[0, 41]], superposition },
          { initialStateIndex: 0, params: [[0, 43]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })

    test("должен работать с алиасом 'ne'", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { ne: 0 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 0]], superposition },
          { initialStateIndex: 0, params: [[0, 1]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
    })

    test("должен работать с алиасом 'notEq'", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { notEq: 100 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 100]], superposition },
          { initialStateIndex: 0, params: [[0, 99]], superposition },
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 50 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 100]], superposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition },
          { initialStateIndex: 0, params: [[0, 49]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен работать с отрицательными числами", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: -10 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, -5]], superposition },
          { initialStateIndex: 0, params: [[0, -10]], superposition },
          { initialStateIndex: 0, params: [[0, -15]], superposition },
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { lt: 50 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 49]], superposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition },
          { initialStateIndex: 0, params: [[0, 51]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен работать с отрицательными числами", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { lt: -5 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, -10]], superposition },
          { initialStateIndex: 0, params: [[0, -5]], superposition },
          { initialStateIndex: 0, params: [[0, 0]], superposition },
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gte: 50 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 100]], superposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition },
          { initialStateIndex: 0, params: [[0, 49]], superposition },
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { lte: 50 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 49]], superposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition },
          { initialStateIndex: 0, params: [[0, 51]], superposition },
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { in: [10, 20, 30] } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 10]], superposition },
          { initialStateIndex: 0, params: [[0, 20]], superposition },
          { initialStateIndex: 0, params: [[0, 30]], superposition },
          { initialStateIndex: 0, params: [[0, 15]], superposition },
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { in: [] } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [{ initialStateIndex: 0, params: [[0, 10]], superposition }],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен выполнить переход, если значение не в списке", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { notIn: [10, 20, 30] } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 10]], superposition },
          { initialStateIndex: 0, params: [[0, 15]], superposition },
          { initialStateIndex: 0, params: [[0, 25]], superposition },
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { between: [10, 20] } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 9]], superposition },
          { initialStateIndex: 0, params: [[0, 10]], superposition },
          { initialStateIndex: 0, params: [[0, 15]], superposition },
          { initialStateIndex: 0, params: [[0, 20]], superposition },
          { initialStateIndex: 0, params: [[0, 21]], superposition },
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { notGt: 50 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 49]], superposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition },
          { initialStateIndex: 0, params: [[0, 51]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })

    test("notGte должен быть эквивалентен lt", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { notGte: 50 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 49]], superposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition },
          { initialStateIndex: 0, params: [[0, 51]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("notLt должен быть эквивалентен gte", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { notLt: 50 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 49]], superposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition },
          { initialStateIndex: 0, params: [[0, 51]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })

    test("notLte должен быть эквивалентен gt", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { notLte: 50 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 49]], superposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition },
          { initialStateIndex: 0, params: [[0, 51]], superposition },
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
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gte: 10, lte: 20 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 9]], superposition },
          { initialStateIndex: 0, params: [[0, 15]], superposition },
          { initialStateIndex: 0, params: [[0, 21]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Обновление числовых значений", () => {
    test("должен выполнить переход после обновления значения", async () => {
      const superposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 50 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [{ initialStateIndex: 0, params: [[0, 30]], superposition }],
      })

      boundary.updateBraneField(0, 0, 60)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })
  })
})
