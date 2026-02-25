import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../src/index"
import { toNumericSuperposition } from "./numeric.helper"

/**
 * E2E тесты для индивидуальных суперпозиций на реальном GPU с bun-webgpu.
 *
 * Эти тесты проверяют полную интеграцию компиляции и выполнения
 * на GPU с разными суперпозициями для каждого поля.
 */
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
      

      const warriorSuperposition = toNumericSuperposition({
        IDLE: { COMBAT: { 0: { gt: 80 } } },
        COMBAT: null,
      })

      const mageSuperposition = toNumericSuperposition({
        IDLE: { MEDITATE: { 1: { lt: 20 } } },
        MEDITATE: null,
      })

      const scoutSuperposition = toNumericSuperposition({
        IDLE: { SCOUT: { 0: { gt: 30 } } },
        SCOUT: null,
      })

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { initialStateIndex: 0, params: [[0, 90], [1, 50]], superposition: warriorSuperposition },
          { initialStateIndex: 0, params: [[0, 50], [1, 10]], superposition: mageSuperposition },
          { initialStateIndex: 0, params: [[0, 60], [1, 30]], superposition: scoutSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("COMBAT")
      expect(states[1]).toBe("MEDITATE")
      expect(states[2]).toBe("SCOUT")
    })
  })

  describe("Поля с разными условиями перехода", () => {
    test("разные пороги для одного перехода", async () => {
      

      const lowThresholdSuperposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 30 } } },
        ACTIVE: null,
      })

      const highThresholdSuperposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 70 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 50]], superposition: lowThresholdSuperposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition: highThresholdSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("разные операторы сравнения", async () => {
      

      const gtSuperposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 50 } } },
        ACTIVE: null,
      })

      const gteSuperposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gte: 50 } } },
        ACTIVE: null,
      })

      const ltSuperposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { lt: 50 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 50]], superposition: gtSuperposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition: gteSuperposition },
          { initialStateIndex: 0, params: [[0, 50]], superposition: ltSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Поля с полностью разными конечными автоматами", () => {
    test("агрессивный против защитного юнита", async () => {
      

      const aggressiveSuperposition = toNumericSuperposition({
        IDLE: { ATTACK: { 0: { gt: 50 } } },
        ATTACK: { VICTORY: { 0: { gt: 90 } } },
        VICTORY: null,
      })

      const defensiveSuperposition = toNumericSuperposition({
        IDLE: { DEFEND: { 0: { lte: 50 } } },
        DEFEND: { FORTIFY: { 0: { lte: 20 } } },
        FORTIFY: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 95]], superposition: aggressiveSuperposition },
          { initialStateIndex: 0, params: [[0, 15]], superposition: defensiveSuperposition },
        ],
      })

      boundary.step()
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("VICTORY")
      expect(states[1]).toBe("FORTIFY")
    })
  })

  describe("Разные типы условий", () => {
    test("числовые, логические и множественные условия", async () => {
      

      const numericSuperposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 50 } } },
        ACTIVE: null,
      })

      const booleanSuperposition = toNumericSuperposition({
        IDLE: { ACTIVE: { 2: true } },
        ACTIVE: null,
      })

      const multiConditionSuperposition = toNumericSuperposition({
        IDLE: {
          ACTIVE: {
            0: { gt: 30 },
            1: { gt: 20 },
          },
        },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
          [2, { type: FieldType.BOOL }],
        ],
        branes: [
          { initialStateIndex: 0, params: [[0, 60], [1, 0], [2, false]], superposition: numericSuperposition },
          { initialStateIndex: 0, params: [[0, 0], [1, 0], [2, true]], superposition: booleanSuperposition },
          { initialStateIndex: 0, params: [[0, 40], [1, 30], [2, false]], superposition: multiConditionSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Обновление браны с индивидуальной суперпозицией", () => {
    test("разные начальные значения с разными порогами", async () => {
      

      const superposition1 = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 50 } } },
        ACTIVE: null,
      })

      const superposition2 = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 70 } } },
        ACTIVE: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 60]], superposition: superposition1 },
          { initialStateIndex: 0, params: [[0, 60]], superposition: superposition2 },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Многошаговая симуляция", () => {
    test("каждое поле следует своему пути состояний", async () => {
      

      const unit1Superposition = toNumericSuperposition({
        IDLE: { PHASE1: { 0: { gt: 80 } } },
        PHASE1: { PHASE2: { 0: { gt: 60 } } },
        PHASE2: { FINAL: { 0: { gt: 40 } } },
        FINAL: null,
      })

      const unit2Superposition = toNumericSuperposition({
        IDLE: { STAGE_A: { 1: { lt: 50 } } },
        STAGE_A: { STAGE_B: { 1: { lt: 20 } } },
        STAGE_B: null,
      })

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { initialStateIndex: 0, params: [[0, 90], [1, 100]], superposition: unit1Superposition },
          { initialStateIndex: 0, params: [[0, 100], [1, 10]], superposition: unit2Superposition },
        ],
      })

      boundary.step()
      boundary.step()
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("FINAL")
      expect(states[1]).toBe("STAGE_B")
    })
  })
})