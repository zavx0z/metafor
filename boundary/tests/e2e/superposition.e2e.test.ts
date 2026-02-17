import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BrowserWebGPU } from "../fixture/browserWebGPU"

/**
 * E2E тесты для индивидуальных суперпозиций на реальном GPU.
 *
 * Эти тесты проверяют полную интеграцию компиляции и выполнения
 * на GPU с разными суперпозициями для каждого поля.
 *
 * ### Покрываемые сценарии:
 * 1. Поля с разными состояниями в суперпозиции
 * 2. Поля с разными условиями перехода
 * 3. Поля с разными порогами для одного перехода
 * 4. Поля с полностью разными машинами состояний
 * 5. Многошаговые симуляции с индивидуальными переходами
 */
describe("Boundary — E2E тесты индивидуальных суперпозиций", () => {
  beforeAll(async () => await BrowserWebGPU.setup())
  afterAll(async () => await BrowserWebGPU.teardown(), 20000)
  const fixture = new BrowserWebGPU()

  describe("Поля с разными состояниями", () => {
    test("каждое поле переходит в своё целевое состояние", async () => {
      // Воин: IDLE -> COMBAT при hp > 80
      const warriorSuperposition = {
        IDLE: { COMBAT: { hp: { gt: 80 } } },
        COMBAT: null,
      }

      // Маг: IDLE -> MEDITATE при mana < 20
      const mageSuperposition = {
        IDLE: { MEDITATE: { mana: { lt: 20 } } },
        MEDITATE: null,
      }

      // Разведчик: IDLE -> SCOUT при hp > 30
      const scoutSuperposition = {
        IDLE: { SCOUT: { hp: { gt: 30 } } },
        SCOUT: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [
          { id: "warrior", state: "IDLE", fields: { hp: 90, mana: 50 }, superposition: warriorSuperposition },
          { id: "mage", state: "IDLE", fields: { hp: 50, mana: 10 }, superposition: mageSuperposition },
          { id: "scout", state: "IDLE", fields: { hp: 60, mana: 30 }, superposition: scoutSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Воин: hp=90 > 80 -> COMBAT
      expect(result.states![0]).toBe("COMBAT")
      // Маг: mana=10 < 20 -> MEDITATE
      expect(result.states![1]).toBe("MEDITATE")
      // Разведчик: hp=60 > 30 -> SCOUT
      expect(result.states![2]).toBe("SCOUT")
    })
  })

  describe("Поля с разными условиями перехода", () => {
    test("разные пороги для одного перехода", async () => {
      // Поле 0: IDLE -> ACTIVE при hp > 30 (низкий порог)
      const lowThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 30 } } },
        ACTIVE: null,
      }

      // Поле 1: IDLE -> ACTIVE при hp > 70 (высокий порог)
      const highThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 70 } } },
        ACTIVE: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 50 }, superposition: lowThresholdSuperposition },
          { id: "q2", state: "IDLE", fields: { hp: 50 }, superposition: highThresholdSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 0: hp=50 > 30 -> ACTIVE
      expect(result.states![0]).toBe("ACTIVE")
      // Поле 1: hp=50 не > 70 -> IDLE
      expect(result.states![1]).toBe("IDLE")
    })

    test("разные операторы сравнения", async () => {
      // Поле 0: переход при hp > 50
      const gtSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      // Поле 1: переход при hp >= 50
      const gteSuperposition = {
        IDLE: { ACTIVE: { hp: { gte: 50 } } },
        ACTIVE: null,
      }

      // Поле 2: переход при hp < 50
      const ltSuperposition = {
        IDLE: { ACTIVE: { hp: { lt: 50 } } },
        ACTIVE: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 50 }, superposition: gtSuperposition },
          { id: "q2", state: "IDLE", fields: { hp: 50 }, superposition: gteSuperposition },
          { id: "q3", state: "IDLE", fields: { hp: 50 }, superposition: ltSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 0: hp=50 не > 50 -> IDLE
      expect(result.states![0]).toBe("IDLE")
      // Поле 1: hp=50 >= 50 -> ACTIVE
      expect(result.states![1]).toBe("ACTIVE")
      // Поле 2: hp=50 не < 50 -> IDLE
      expect(result.states![2]).toBe("IDLE")
    })
  })

  describe("Поля с полностью разными машинами состояний", () => {
    test("агрессивный против оборонительного юнита", async () => {
      // Агрессивный: IDLE -> ATTACK -> VICTORY
      const aggressiveSuperposition = {
        IDLE: { ATTACK: { hp: { gt: 50 } } },
        ATTACK: { VICTORY: { hp: { gt: 90 } } },
        VICTORY: null,
      }

      // Оборонительный: IDLE -> DEFEND -> FORTIFY
      const defensiveSuperposition = {
        IDLE: { DEFEND: { hp: { lte: 50 } } },
        DEFEND: { FORTIFY: { hp: { lte: 20 } } },
        FORTIFY: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
        },
        branes: [
          { id: "aggressive", state: "IDLE", fields: { hp: 95 }, superposition: aggressiveSuperposition },
          { id: "defensive", state: "IDLE", fields: { hp: 15 }, superposition: defensiveSuperposition },
        ],
        steps: 2,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агрессивный: IDLE -> ATTACK (hp=95>50) -> VICTORY (hp=95>90)
      expect(result.states![0]).toBe("VICTORY")
      // Оборонительный: IDLE -> DEFEND (hp=15<=50) -> FORTIFY (hp=15<=20)
      expect(result.states![1]).toBe("FORTIFY")
    })
  })

  describe("Разные типы условий", () => {
    test("числовые, булевы и множественные условия", async () => {
      // Поле 0: числовое условие
      const numericSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      // Поле 1: булево условие
      const booleanSuperposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }

      // Поле 2: множественное условие
      const multiConditionSuperposition = {
        IDLE: {
          ACTIVE: {
            hp: { gt: 30 },
            mana: { gt: 20 },
          },
        },
        ACTIVE: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 60, mana: 0, isAlive: false }, superposition: numericSuperposition },
          { id: "q2", state: "IDLE", fields: { hp: 0, mana: 0, isAlive: true }, superposition: booleanSuperposition },
          { id: "q3", state: "IDLE", fields: { hp: 40, mana: 30, isAlive: false }, superposition: multiConditionSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 0: hp=60 > 50 -> ACTIVE
      expect(result.states![0]).toBe("ACTIVE")
      // Поле 1: isAlive=true -> ACTIVE
      expect(result.states![1]).toBe("ACTIVE")
      // Поле 2: hp=40>30 И mana=30>20 -> ACTIVE
      expect(result.states![2]).toBe("ACTIVE")
    })
  })

  describe("Обновление браны с индивидуальной суперпозицией", () => {
    test("разные начальные значения с разными порогами", async () => {
      // Поле 0: IDLE -> ACTIVE при hp > 50
      const superposition1 = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      // Поле 1: IDLE -> ACTIVE при hp > 70
      const superposition2 = {
        IDLE: { ACTIVE: { hp: { gt: 70 } } },
        ACTIVE: null,
      }

      // Используем разные начальные значения для избежания запутанной браны
      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 60 }, superposition: superposition1 },
          { id: "q2", state: "IDLE", fields: { hp: 60 }, superposition: superposition2 },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 0: hp=60 > 50 -> ACTIVE
      expect(result.states![0]).toBe("ACTIVE")
      // Поле 1: hp=60 не > 70 -> IDLE
      expect(result.states![1]).toBe("IDLE")
    })
  })

  describe("Многошаговая симуляция", () => {
    test("каждое поле следует своему пути состояний", async () => {
      // Юнит 1: IDLE -> PHASE1 -> PHASE2 -> FINAL
      const unit1Superposition = {
        IDLE: { PHASE1: { hp: { gt: 80 } } },
        PHASE1: { PHASE2: { hp: { gt: 60 } } },
        PHASE2: { FINAL: { hp: { gt: 40 } } },
        FINAL: null,
      }

      // Юнит 2: IDLE -> STAGE_A -> STAGE_B
      const unit2Superposition = {
        IDLE: { STAGE_A: { mana: { lt: 50 } } },
        STAGE_A: { STAGE_B: { mana: { lt: 20 } } },
        STAGE_B: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [
          { id: "unit1", state: "IDLE", fields: { hp: 90, mana: 100 }, superposition: unit1Superposition },
          { id: "unit2", state: "IDLE", fields: { hp: 100, mana: 10 }, superposition: unit2Superposition },
        ],
        steps: 3,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Юнит 1: IDLE -> PHASE1 -> PHASE2 -> FINAL
      expect(result.states![0]).toBe("FINAL")
      // Юнит 2: IDLE -> STAGE_A -> STAGE_B (останавливается на STAGE_B)
      expect(result.states![1]).toBe("STAGE_B")
    })
  })
})
