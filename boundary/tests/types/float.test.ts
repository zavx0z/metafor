import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../../src/index"
import type { NumericSuperposition } from "../../src/index.t"

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
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: 42 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 42]], superposition },
          { initialStateIndex: 0, states, params: [[0, 41]], superposition },
          { initialStateIndex: 0, states, params: [[0, 43]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
      expect(resultStates[2]).toBe("IDLE")
    })

    test("должен работать с отрицательными числами", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: -10 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, -10]], superposition },
          { initialStateIndex: 0, states, params: [[0, 10]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
    })

    test("должен работать с дробными числами", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: 3.14 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 3.14]], superposition },
          { initialStateIndex: 0, states, params: [[0, 3.15]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
    })

    test("должен работать с нулём", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { eq: 0 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 0]], superposition },
          { initialStateIndex: 0, states, params: [[0, 0.001]], superposition },
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
          [{ to: 1, conditions: { 0: { neq: 42 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 42]], superposition },
          { initialStateIndex: 0, states, params: [[0, 41]], superposition },
          { initialStateIndex: 0, states, params: [[0, 43]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("ACTIVE")
    })

    test("должен работать с алиасом 'ne'", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { ne: 0 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 0]], superposition },
          { initialStateIndex: 0, states, params: [[0, 1]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("ACTIVE")
    })

    test("должен работать с алиасом 'notEq'", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { notEq: 100 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 100]], superposition },
          { initialStateIndex: 0, states, params: [[0, 99]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("ACTIVE")
    })
  })

  describe("Оператор GT (больше)", () => {
    test("должен выполнить переход, когда значение больше указанного", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 100 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 100]], superposition },
          { initialStateIndex: 0, states, params: [[0, 99]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("IDLE")
    })
  })

  describe("Оператор GT (больше) с отрицательными числами", () => {
    test("должен работать с отрицательными числами", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: -10 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, -5]], superposition },
          { initialStateIndex: 0, states, params: [[0, -10]], superposition },
          { initialStateIndex: 0, states, params: [[0, -15]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")  // -5 > -10
      expect(resultStates[1]).toBe("IDLE")    // -10 не > -10
      expect(resultStates[2]).toBe("IDLE")    // -15 не > -10
    })
  })

  describe("Оператор LT (меньше)", () => {
    test("должен выполнить переход, когда значение меньше указанного", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lt: 50 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 49]], superposition },
          { initialStateIndex: 0, states, params: [[0, 50]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
    })

    test("должен работать с отрицательными числами", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lt: -5 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, -10]], superposition },
          { initialStateIndex: 0, states, params: [[0, -5]], superposition },
          { initialStateIndex: 0, states, params: [[0, 0]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")  // -10 < -5
      expect(resultStates[1]).toBe("IDLE")    // -5 не < -5
      expect(resultStates[2]).toBe("IDLE")    // 0 не < -5
    })
  })

  describe("Оператор GTE (больше или равно)", () => {
    test("должен выполнить переход, когда значение больше или равно указанному", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gte: 50 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 49]], superposition },
          { initialStateIndex: 0, states, params: [[0, 50]], superposition },
          { initialStateIndex: 0, states, params: [[0, 51]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("ACTIVE")
    })
  })

  describe("Оператор LTE (меньше или равно)", () => {
    test("должен выполнить переход, когда значение меньше или равно указанному", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lte: 50 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 49]], superposition },
          { initialStateIndex: 0, states, params: [[0, 50]], superposition },
          { initialStateIndex: 0, states, params: [[0, 51]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("IDLE")
    })
  })

  describe("Оператор IN (в списке)", () => {
    test("должен выполнить переход, если значение в списке", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { in: [10, 20, 30] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 10]], superposition },
          { initialStateIndex: 0, states, params: [[0, 20]], superposition },
          { initialStateIndex: 0, states, params: [[0, 30]], superposition },
          { initialStateIndex: 0, states, params: [[0, 15]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("ACTIVE")
      expect(resultStates[3]).toBe("IDLE")
    })

    test("должен работать с пустым списком", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { in: [] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 10]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен выполнить переход, если значение не в списке", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { notIn: [10, 20] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 10]], superposition },
          { initialStateIndex: 0, states, params: [[0, 15]], superposition },
          { initialStateIndex: 0, states, params: [[0, 25]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("ACTIVE")
    })
  })

  describe("Составные условия (between)", () => {
    test("должен выполнить переход, если значение в диапазоне", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { between: [10, 20] } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 9]], superposition },
          { initialStateIndex: 0, states, params: [[0, 15]], superposition },
          { initialStateIndex: 0, states, params: [[0, 25]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("IDLE")
    })
  })

  describe("Отрицательные условия (notGt, notGte, notLt, notLte)", () => {
    test("notGt должен быть эквивалентен lte", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { notGt: 50 } } }],  // ! > 50 == <= 50
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 49]], superposition },
          { initialStateIndex: 0, states, params: [[0, 50]], superposition },
          { initialStateIndex: 0, states, params: [[0, 51]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("IDLE")
    })

    test("notGte должен быть эквивалентен lt", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { notGte: 50 } } }],  // ! >= 50 == < 50
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 49]], superposition },
          { initialStateIndex: 0, states, params: [[0, 50]], superposition },
          { initialStateIndex: 0, states, params: [[0, 51]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
      expect(resultStates[2]).toBe("IDLE")
    })

    test("notLt должен быть эквивалентен gte", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { notLt: 50 } } }],  // ! < 50 == >= 50
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 49]], superposition },
          { initialStateIndex: 0, states, params: [[0, 50]], superposition },
          { initialStateIndex: 0, states, params: [[0, 51]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("ACTIVE")
    })

    test("notLte должен быть эквивалентен gt", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { notLte: 50 } } }],  // ! <= 50 == > 50
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 49]], superposition },
          { initialStateIndex: 0, states, params: [[0, 50]], superposition },
          { initialStateIndex: 0, states, params: [[0, 51]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
      expect(resultStates[1]).toBe("IDLE")
      expect(resultStates[2]).toBe("ACTIVE")
    })
  })

  describe("Множественные условия", () => {
    test("должен выполнить переход, когда все условия для одного поля выполнены (логика И)", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: { gte: 10 },
                1: { lte: 20 },
              },
            },
          ],
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { initialStateIndex: 0, states, params: [[0, 9], [1, 15]], superposition },    // 9 не >= 10
          { initialStateIndex: 0, states, params: [[0, 15], [1, 15]], superposition },   // 15>=10 И 15<=20
          { initialStateIndex: 0, states, params: [[0, 15], [1, 21]], superposition },   // 21 не <= 20
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")   // 9 не >= 10
      expect(resultStates[1]).toBe("ACTIVE") // 15>=10 И 15<=20
      expect(resultStates[2]).toBe("IDLE")   // 21 не <= 20
    })
  })

  describe("Обновление числовых значений", () => {
    test("должен выполнить переход после обновления значения", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 30 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [{ initialStateIndex: 0, states, params: [[0, 10]], superposition }],
      })

      boundary.updateBraneField(0, 0, 50)
      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
    })
  })
})
