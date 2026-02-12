import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BoundaryTestFixture } from "./fixture"

describe("Boundary — Тесты логики (реальное устройство GPU)", () => {
  beforeAll(async () => await BoundaryTestFixture.setup())
  afterAll(async () => await BoundaryTestFixture.teardown(), 20000)
  const fixture = new BoundaryTestFixture()

  /** Общая суперпозиция для тестов с hp/mana/isAlive */
  const defaultSuperposition = {
    IDLE: {
      PATROL: { hp: { gt: 50 } },
      DEAD: { hp: { lte: 0 } },
    },
    PATROL: {
      IDLE: { mana: { lt: 10 } },
      COMBAT: { isAlive: true },
    },
    COMBAT: {
      DEAD: { hp: { lte: 0 } },
    },
    DEAD: null,
  }

  describe("Базовые переходы состояний", () => {
    test("должен перейти из состояния IDLE в DEAD при здоровье <= 0", async () => {
      const result = await fixture.runSimulation({
        branes: {
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        fields: [
          { id: "q1", state: "IDLE", brane: { hp: 100, mana: 100, isAlive: true }, superposition: defaultSuperposition },
          { id: "q2", state: "IDLE", brane: { hp: 0, mana: 50, isAlive: false }, superposition: defaultSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      expect(result.states![0]).toBe("PATROL")
      expect(result.states![1]).toBe("DEAD")
    })

    test("должен перейти из состояния IDLE в PATROL при здоровье > 50", async () => {
      const superposition = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: { type: "number" },
        },
        fields: [
          { id: "q1", state: "IDLE", brane: { hp: 100 }, superposition },
          { id: "q2", state: "IDLE", brane: { hp: 50 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 1 должно перейти в состояние PATROL (hp = 100 > 50)
      expect(result.states![0]).toBe("PATROL")
      // Поле 2 должно остаться в состоянии IDLE (hp = 50 не > 50)
      expect(result.states![1]).toBe("IDLE")
    })

    test("должен перейти из состояния IDLE в PATROL при здоровье >= 50", async () => {
      const superposition = {
        IDLE: { PATROL: { hp: { gte: 50 } } },
        PATROL: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [
          { id: "q1", state: "IDLE", brane: { hp: 50 }, superposition },
          { id: "q2", state: "IDLE", brane: { hp: 49 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 1 должно перейти в состояние PATROL (hp = 50 >= 50)
      expect(result.states![0]).toBe("PATROL")
      // Поле 2 должно остаться в состоянии IDLE (hp = 49 не >= 50)
      expect(result.states![1]).toBe("IDLE")
    })

    test("должен перейти из состояния IDLE в PATROL при здоровье < 50", async () => {
      const superposition = {
        IDLE: { PATROL: { hp: { lt: 50 } } },
        PATROL: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [
          { id: "q1", state: "IDLE", brane: { hp: 49 }, superposition },
          { id: "q2", state: "IDLE", brane: { hp: 50 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 1 должно перейти в состояние PATROL (hp = 49 < 50)
      expect(result.states![0]).toBe("PATROL")
      // Поле 2 должно остаться в состоянии IDLE (hp = 50 не < 50)
      expect(result.states![1]).toBe("IDLE")
    })
  })

  describe("Булевы условия", () => {
    test("должен перейти при значении булевой компоненты = true", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          isAlive: { type: "boolean" },
        },
        fields: [
          { id: "q1", state: "IDLE", brane: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 1 должно перейти в состояние ACTIVE (isAlive = true)
      expect(result.states![0]).toBe("ACTIVE")
      // Поле 2 должно остаться в состоянии IDLE (isAlive = false)
      expect(result.states![1]).toBe("IDLE")
    })

    test("должен перейти при значении булевой компоненты = false", async () => {
      const superposition = {
        ACTIVE: { DEAD: { isAlive: false } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          isAlive: "boolean",
        },
        fields: [
          { id: "q1", state: "ACTIVE", brane: { isAlive: false }, superposition },
          { id: "q2", state: "ACTIVE", brane: { isAlive: true }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 1 должно перейти в состояние DEAD (isAlive = false)
      expect(result.states![0]).toBe("DEAD")
      // Поле 2 должно остаться в состоянии ACTIVE (isAlive = true)
      expect(result.states![1]).toBe("ACTIVE")
    })
  })

  describe("Множественные условия", () => {
    test("должен перейти когда выполнены оба условия", async () => {
      const superposition = {
        IDLE: {
          COMBAT: {
            hp: { gt: 50 },
            mana: { gt: 20 },
          },
        },
        COMBAT: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
          mana: "number",
        },
        fields: [
          { id: "q1", state: "IDLE", brane: { hp: 100, mana: 50 }, superposition },
          { id: "q2", state: "IDLE", brane: { hp: 100, mana: 10 }, superposition },
          { id: "q3", state: "IDLE", brane: { hp: 30, mana: 50 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 1 должно перейти в состояние COMBAT (оба условия выполнены)
      expect(result.states![0]).toBe("COMBAT")
      // Поле 2 должно остаться в состоянии IDLE (mana = 10 не > 20)
      expect(result.states![1]).toBe("IDLE")
      // Поле 3 должно остаться в состоянии IDLE (hp = 30 не > 50)
      expect(result.states![2]).toBe("IDLE")
    })
  })

  describe("Обновление браны", () => {
    test("должен перейти после обновления браны", async () => {
      const superposition = {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [{ id: "q1", state: "IDLE", brane: { hp: 100 }, superposition }],
        updates: [{ fieldIndex: 0, componentName: "hp", value: 0 }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле должно перейти в состояние DEAD после обновления браны (hp = 0)
      expect(result.states![0]).toBe("DEAD")
    })

    test("не должен перейти после обновления браны если условие не выполнено", async () => {
      const superposition = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [{ id: "q1", state: "IDLE", brane: { hp: 100 }, superposition }],
        updates: [{ fieldIndex: 0, componentName: "hp", value: 50 }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле должно остаться в состоянии IDLE после обновления браны (hp = 50 не > 50)
      expect(result.states![0]).toBe("IDLE")
    })
  })

  describe("Многошаговая симуляция", () => {
    test("должен пройти через несколько состояний", async () => {
      const superposition = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: { COMBAT: { mana: { lt: 10 } } },
        COMBAT: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
          mana: "number",
        },
        fields: [{ id: "q1", state: "IDLE", brane: { hp: 100, mana: 5 }, superposition }],
        steps: 2,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // После 2 шагов поле должно перейти из IDLE -> PATROL -> COMBAT
      expect(result.states![0]).toBe("COMBAT")
    })
  })

  describe("Пограничные случаи", () => {
    test("должен обработать несколько полей с одинаковым начальным состоянием", async () => {
      const superposition = {
        IDLE: { ACTIVE: { hp: { gt: 0 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [
          { id: "q1", state: "IDLE", brane: { hp: 100 }, superposition },
          { id: "q2", state: "IDLE", brane: { hp: 200 }, superposition },
          { id: "q3", state: "IDLE", brane: { hp: 0 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поля 1 и 2 должны перейти в состояние ACTIVE (hp > 0)
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("ACTIVE")
      // Поле 3 должно остаться в состоянии IDLE (hp = 0 не > 0)
      expect(result.states![2]).toBe("IDLE")
    })

    test("должен обработать поля с разными начальными состояниями", async () => {
      const superposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: { IDLE: { hp: { lte: 50 } } },
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [
          { id: "q1", state: "IDLE", brane: { hp: 100 }, superposition },
          { id: "q2", state: "ACTIVE", brane: { hp: 30 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 1 должно перейти из состояния IDLE в ACTIVE (hp = 100 > 50)
      expect(result.states![0]).toBe("ACTIVE")
      // Поле 2 должно перейти из состояния ACTIVE в IDLE (hp = 30 <= 50)
      expect(result.states![1]).toBe("IDLE")
    })
  })

  describe("Поля с разными superposition", () => {
    test("каждое поле имеет свою superposition с разными состояниями", async () => {
      // Поле 1: воин — переходит в COMBAT при высоком hp
      const warriorSuperposition = {
        IDLE: { COMBAT: { hp: { gt: 80 } } },
        COMBAT: null,
      }

      // Поле 2: маг — переходит in MEDITATION при низком mana
      const mageSuperposition = {
        IDLE: { MEDITATION: { mana: { lt: 20 } } },
        MEDITATION: null,
      }

      // Поле 3: разведчик — переходит в SCOUT при hp > 30
      const scoutSuperposition = {
        IDLE: { SCOUT: { hp: { gt: 30 } } },
        SCOUT: null,
      }

      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
          mana: "number",
        },
        fields: [
          { id: "warrior", state: "IDLE", brane: { hp: 90, mana: 50 }, superposition: warriorSuperposition },
          { id: "mage", state: "IDLE", brane: { hp: 50, mana: 10 }, superposition: mageSuperposition },
          { id: "scout", state: "IDLE", brane: { hp: 60, mana: 30 }, superposition: scoutSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Воин: hp = 90 > 80 → COMBAT
      expect(result.states![0]).toBe("COMBAT")
      // Маг: mana = 10 < 20 → MEDITATION
      expect(result.states![1]).toBe("MEDITATION")
      // Разведчик: hp = 60 > 30 → SCOUT
      expect(result.states![2]).toBe("SCOUT")
    })

    test("поля с одинаковыми состояниями, но разными условиями перехода", async () => {
      // Оба поля начинают в IDLE и могут перейти в ACTIVE,
      // но с разными порогами hp

      const lowThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 30 } } },
        ACTIVE: null,
      }

      const highThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 70 } } },
        ACTIVE: null,
      }

      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [
          { id: "q1", state: "IDLE", brane: { hp: 50 }, superposition: lowThresholdSuperposition },
          { id: "q2", state: "IDLE", brane: { hp: 50 }, superposition: highThresholdSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 1: hp = 50 > 30 → ACTIVE (низкий порог)
      expect(result.states![0]).toBe("ACTIVE")
      // Поле 2: hp = 50 не > 70 → IDLE (высокий порог)
      expect(result.states![1]).toBe("IDLE")
    })

    test("поля с полностью разными машинами состояний", async () => {
      // Агрессивный юнит: IDLE → ATTACK → VICTORY
      const aggressiveSuperposition = {
        IDLE: { ATTACK: { hp: { gt: 50 } } },
        ATTACK: { VICTORY: { hp: { gt: 90 } } },
        VICTORY: null,
      }

      // Оборонительный юнит: IDLE → DEFEND → FORTIFY
      const defensiveSuperposition = {
        IDLE: { DEFEND: { hp: { lte: 50 } } },
        DEFEND: { FORTIFY: { hp: { lte: 20 } } },
        FORTIFY: null,
      }

      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [
          { id: "aggressive", state: "IDLE", brane: { hp: 95 }, superposition: aggressiveSuperposition },
          { id: "defensive", state: "IDLE", brane: { hp: 15 }, superposition: defensiveSuperposition },
        ],
        steps: 2,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агрессивный: IDLE → ATTACK (hp=95>50) → VICTORY (hp=95>90)
      expect(result.states![0]).toBe("VICTORY")
      // Оборонительный: IDLE → DEFEND (hp=15<=50) → FORTIFY (hp=15<=20)
      expect(result.states![1]).toBe("FORTIFY")
    })

    test("поля с разными типами условий в superposition", async () => {
      // Поле 1: переход по числовому условию
      const numericSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      // Поле 2: переход по булеву условию
      const booleanSuperposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }

      // Поле 3: переход по множественному условию
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
        branes: {
          hp: "number",
          mana: "number",
          isAlive: "boolean",
        },
        fields: [
          { id: "q1", state: "IDLE", brane: { hp: 60, mana: 0, isAlive: false }, superposition: numericSuperposition },
          { id: "q2", state: "IDLE", brane: { hp: 0, mana: 0, isAlive: true }, superposition: booleanSuperposition },
          { id: "q3", state: "IDLE", brane: { hp: 40, mana: 30, isAlive: false }, superposition: multiConditionSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 1: hp = 60 > 50 → ACTIVE
      expect(result.states![0]).toBe("ACTIVE")
      // Поле 2: isAlive = true → ACTIVE
      expect(result.states![1]).toBe("ACTIVE")
      // Поле 3: hp = 40 > 30 И mana = 30 > 20 → ACTIVE
      expect(result.states![2]).toBe("ACTIVE")
    })
  })
})
