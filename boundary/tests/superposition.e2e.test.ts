import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../src/index"
import type { NumericSuperposition } from "../src/index.t"

describe("Boundary — E2E тесты для индивидуальных суперпозиций (bun-webgpu)", () => {
  let boundary: Boundary

  beforeAll(async () => {
    GPU._device = await setupDevice()
    boundary = new Boundary()
  })

  afterEach(() => {
    boundary.clear()
  })

  describe("Поля с разными состояниями", () => {
    test("каждое поле переходит в целевое состояние", async () => {
      const warriorStates = ["IDLE", "COMBAT"]
      const warriorSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 80 } } }],
          [null],
        ],
      }

      const mageStates = ["IDLE", "MEDITATE"]
      const mageSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 1: { lt: 20 } } }],
          [null],
        ],
      }

      const scoutStates = ["IDLE", "SCOUT"]
      const scoutSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 30 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { state: 0, states: warriorStates, params: [[0, 90], [1, 50]], superposition: warriorSuperposition },
          { state: 0, states: mageStates, params: [[0, 50], [1, 10]], superposition: mageSuperposition },
          { state: 0, states: scoutStates, params: [[0, 60], [1, 30]], superposition: scoutSuperposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("COMBAT")
      expect(resultStates[1]).toBe("MEDITATE")
      expect(resultStates[2]).toBe("SCOUT")
    })
  })

  describe("Поля с разными условиями перехода", () => {
    test("разные пороги для одного перехода", async () => {
      const states = ["IDLE", "ACTIVE"]

      const lowThresholdSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 30 } } }],
          [null],
        ],
      }

      const highThresholdSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 70 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 50]], superposition: lowThresholdSuperposition },
          { state: 0, states, params: [[0, 50]], superposition: highThresholdSuperposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
    })

    test("разные операторы сравнения", async () => {
      const states = ["IDLE", "ACTIVE"]

      const gtSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],
          [null],
        ],
      }

      const gteSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gte: 50 } } }],
          [null],
        ],
      }

      const ltSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lt: 50 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 50]], superposition: gtSuperposition },
          { state: 0, states, params: [[0, 50]], superposition: gteSuperposition },
          { state: 0, states, params: [[0, 50]], superposition: ltSuperposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")   // 50 не > 50
      expect(resultStates[1]).toBe("ACTIVE") // 50 >= 50
      expect(resultStates[2]).toBe("IDLE")   // 50 не < 50
    })
  })

  describe("Поля с полностью разными конечными автоматами", () => {
    test("агрессивный против защитного юнита", async () => {
      const aggressiveStates = ["IDLE", "ATTACK", "VICTORY"]
      const aggressiveSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],
          [{ to: 2, conditions: { 0: { gt: 90 } } }],
          [null],
        ],
      }

      const defensiveStates = ["IDLE", "DEFEND", "FORTIFY"]
      const defensiveSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lte: 50 } } }],
          [{ to: 2, conditions: { 0: { lte: 20 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states: aggressiveStates, params: [[0, 95]], superposition: aggressiveSuperposition },
          { state: 0, states: defensiveStates, params: [[0, 15]], superposition: defensiveSuperposition },
        ],
      })

      boundary.step()
      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("VICTORY")
      expect(resultStates[1]).toBe("FORTIFY")
    })
  })

  describe("Разные типы условий", () => {
    test("числовые, логические и множественные условия", async () => {
      const numericStates = ["IDLE", "ACTIVE"]
      const numericSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],
          [null],
        ],
      }

      const booleanStates = ["IDLE", "ACTIVE"]
      const booleanSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 2: true } }],
          [null],
        ],
      }

      const multiConditionStates = ["IDLE", "ACTIVE"]
      const multiConditionSuperposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: { gt: 30 },
                1: { gt: 20 },
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
          [2, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: 0, states: numericStates, params: [[0, 60], [1, 0], [2, false]], superposition: numericSuperposition },
          { state: 0, states: booleanStates, params: [[0, 0], [1, 0], [2, true]], superposition: booleanSuperposition },
          { state: 0, states: multiConditionStates, params: [[0, 40], [1, 30], [2, false]], superposition: multiConditionSuperposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("ACTIVE")
    })
  })

  describe("Обновление браны с индивидуальной суперпозицией", () => {
    test("разные начальные значения с разными порогами", async () => {
      const states = ["IDLE", "ACTIVE"]

      const superposition1: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],
          [null],
        ],
      }

      const superposition2: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 70 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 60]], superposition: superposition1 },
          { state: 0, states, params: [[0, 60]], superposition: superposition2 },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
    })
  })

  describe("Многошаговая симуляция", () => {
    test("каждое поле следует своему пути состояний", async () => {
      const unit1States = ["IDLE", "PATROL", "COMBAT"]
      const unit1Superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 80 } } }],
          [{ to: 2, conditions: { 1: { lt: 20 } } }],
          [null],
        ],
      }

      const unit2States = ["IDLE", "DEFEND", "RETREAT"]
      const unit2Superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lte: 50 } } }],
          [{ to: 2, conditions: { 1: { lt: 10 } } }],
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { state: 0, states: unit1States, params: [[0, 90], [1, 10]], superposition: unit1Superposition },  // hp=90>80, mana=10<20
          { state: 0, states: unit2States, params: [[0, 30], [1, 5]], superposition: unit2Superposition },   // hp=30<=50, mana=5<10
        ],
      })

      boundary.step()  // unit1: IDLE→PATROL, unit2: IDLE→DEFEND
      boundary.step()  // unit1: PATROL→COMBAT, unit2: DEFEND→RETREAT
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("COMBAT")
      expect(resultStates[1]).toBe("RETREAT")
    })
  })
})
