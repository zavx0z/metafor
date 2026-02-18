import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../fixture/bunWebGPU"
import { Boundary } from "../../src/index"

/**
 * E2E тесты для индивидуальных суперпозиций на реальном GPU с bun-webgpu.
 *
 * Эти тесты проверяют полную интеграцию компиляции и выполнения
 * на GPU с разными суперпозициями для каждого поля.
 */
describe("Boundary — E2E тесты для индивидуальных суперпозиций (bun-webgpu)", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  describe("Поля с разными состояниями", () => {
    test("каждое поле переходит в целевое состояние", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const warriorSuperposition = {
        IDLE: { COMBAT: { hp: { gt: 80 } } },
        COMBAT: null,
      }

      const mageSuperposition = {
        IDLE: { MEDITATE: { mana: { lt: 20 } } },
        MEDITATE: null,
      }

      const scoutSuperposition = {
        IDLE: { SCOUT: { hp: { gt: 30 } } },
        SCOUT: null,
      }

      await boundary.init({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [
          { id: "warrior", state: "IDLE", params: { hp: 90, mana: 50 }, superposition: warriorSuperposition },
          { id: "mage", state: "IDLE", params: { hp: 50, mana: 10 }, superposition: mageSuperposition },
          { id: "scout", state: "IDLE", params: { hp: 60, mana: 30 }, superposition: scoutSuperposition },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const lowThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 30 } } },
        ACTIVE: null,
      }

      const highThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 70 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 50 }, superposition: lowThresholdSuperposition },
          { id: "q2", state: "IDLE", params: { hp: 50 }, superposition: highThresholdSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("разные операторы сравнения", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const gtSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      const gteSuperposition = {
        IDLE: { ACTIVE: { hp: { gte: 50 } } },
        ACTIVE: null,
      }

      const ltSuperposition = {
        IDLE: { ACTIVE: { hp: { lt: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 50 }, superposition: gtSuperposition },
          { id: "q2", state: "IDLE", params: { hp: 50 }, superposition: gteSuperposition },
          { id: "q3", state: "IDLE", params: { hp: 50 }, superposition: ltSuperposition },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const aggressiveSuperposition = {
        IDLE: { ATTACK: { hp: { gt: 50 } } },
        ATTACK: { VICTORY: { hp: { gt: 90 } } },
        VICTORY: null,
      }

      const defensiveSuperposition = {
        IDLE: { DEFEND: { hp: { lte: 50 } } },
        DEFEND: { FORTIFY: { hp: { lte: 20 } } },
        FORTIFY: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "aggressive", state: "IDLE", params: { hp: 95 }, superposition: aggressiveSuperposition },
          { id: "defensive", state: "IDLE", params: { hp: 15 }, superposition: defensiveSuperposition },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const numericSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      const booleanSuperposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }

      const multiConditionSuperposition = {
        IDLE: {
          ACTIVE: {
            hp: { gt: 30 },
            mana: { gt: 20 },
          },
        },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 60, mana: 0, isAlive: false }, superposition: numericSuperposition },
          { id: "q2", state: "IDLE", params: { hp: 0, mana: 0, isAlive: true }, superposition: booleanSuperposition },
          { id: "q3", state: "IDLE", params: { hp: 40, mana: 30, isAlive: false }, superposition: multiConditionSuperposition },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition1 = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      const superposition2 = {
        IDLE: { ACTIVE: { hp: { gt: 70 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 60 }, superposition: superposition1 },
          { id: "q2", state: "IDLE", params: { hp: 60 }, superposition: superposition2 },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const unit1Superposition = {
        IDLE: { PHASE1: { hp: { gt: 80 } } },
        PHASE1: { PHASE2: { hp: { gt: 60 } } },
        PHASE2: { FINAL: { hp: { gt: 40 } } },
        FINAL: null,
      }

      const unit2Superposition = {
        IDLE: { STAGE_A: { mana: { lt: 50 } } },
        STAGE_A: { STAGE_B: { mana: { lt: 20 } } },
        STAGE_B: null,
      }

      await boundary.init({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [
          { id: "unit1", state: "IDLE", params: { hp: 90, mana: 100 }, superposition: unit1Superposition },
          { id: "unit2", state: "IDLE", params: { hp: 100, mana: 10 }, superposition: unit2Superposition },
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