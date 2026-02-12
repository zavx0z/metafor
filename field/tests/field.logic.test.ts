import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { QuantumFieldTestFixture } from "./fixture"

describe("QuantumFieldSystem — Тесты логики (реальное устройство GPU)", () => {
  beforeAll(async () => await QuantumFieldTestFixture.setup())
  afterAll(async () => await QuantumFieldTestFixture.teardown(), 20000)
  const fixture = new QuantumFieldTestFixture()

  describe("Базовые переходы состояний", () => {
    test("должен перейти из состояния IDLE в DEAD при здоровье <= 0", async () => {
      const result = await fixture.runSimulation({
        superposition: {
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
        },
        branes: {
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        quanta: [
          { id: "q1", state: "IDLE", brane: { hp: 100, mana: 100, isAlive: true } },
          { id: "q2", state: "IDLE", brane: { hp: 0, mana: 50, isAlive: false } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      expect(result.states![0]).toBe("PATROL")
      expect(result.states![1]).toBe("DEAD")
    })

    test("должен перейти из состояния IDLE в PATROL при здоровье > 50", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          IDLE: {
            PATROL: { hp: { gt: 50 } },
          },
          PATROL: null,
        },
        branes: {
          hp: { type: "number" },
        },
        quanta: [
          { id: "q1", state: "IDLE", brane: { hp: 100 } },
          { id: "q2", state: "IDLE", brane: { hp: 50 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти в состояние PATROL (hp = 100 > 50)
      expect(result.states![0]).toBe("PATROL")
      // Агент 2 должен остаться в состоянии IDLE (hp = 50 не > 50)
      expect(result.states![1]).toBe("IDLE")
    })

    test("должен перейти из состояния IDLE в PATROL при здоровье >= 50", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          IDLE: {
            PATROL: { hp: { gte: 50 } },
          },
          PATROL: null,
        },
        branes: {
          hp: "number",
        },
        quanta: [
          { id: "q1", state: "IDLE", brane: { hp: 50 } },
          { id: "q2", state: "IDLE", brane: { hp: 49 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти в состояние PATROL (hp = 50 >= 50)
      expect(result.states![0]).toBe("PATROL")
      // Агент 2 должен остаться в состоянии IDLE (hp = 49 не >= 50)
      expect(result.states![1]).toBe("IDLE")
    })

    test("должен перейти из состояния IDLE в PATROL при здоровье < 50", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          IDLE: {
            PATROL: { hp: { lt: 50 } },
          },
          PATROL: null,
        },
        branes: {
          hp: "number",
        },
        quanta: [
          { id: "q1", state: "IDLE", brane: { hp: 49 } },
          { id: "q2", state: "IDLE", brane: { hp: 50 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти в состояние PATROL (hp = 49 < 50)
      expect(result.states![0]).toBe("PATROL")
      // Агент 2 должен остаться в состоянии IDLE (hp = 50 не < 50)
      expect(result.states![1]).toBe("IDLE")
    })
  })

  describe("Булевы условия", () => {
    test("должен перейти при значении булевого поля = true", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          IDLE: {
            ACTIVE: { isAlive: true },
          },
          ACTIVE: null,
        },
        branes: {
          isAlive: { type: "boolean" },
        },
        quanta: [
          { id: "q1", state: "IDLE", brane: { isAlive: true } },
          { id: "q2", state: "IDLE", brane: { isAlive: false } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти в состояние ACTIVE (isAlive = true)
      expect(result.states![0]).toBe("ACTIVE")
      // Агент 2 должен остаться в состоянии IDLE (isAlive = false)
      expect(result.states![1]).toBe("IDLE")
    })

    test("должен перейти при значении булевого поля = false", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          ACTIVE: {
            DEAD: { isAlive: false },
          },
          DEAD: null,
        },
        branes: {
          isAlive: "boolean",
        },
        quanta: [
          { id: "q1", state: "ACTIVE", brane: { isAlive: false } },
          { id: "q2", state: "ACTIVE", brane: { isAlive: true } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти в состояние DEAD (isAlive = false)
      expect(result.states![0]).toBe("DEAD")
      // Агент 2 должен остаться в состоянии ACTIVE (isAlive = true)
      expect(result.states![1]).toBe("ACTIVE")
    })
  })

  describe("Множественные условия", () => {
    test("должен перейти когда выполнены оба условия", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          IDLE: {
            COMBAT: {
              hp: { gt: 50 },
              mana: { gt: 20 },
            },
          },
          COMBAT: null,
        },
        branes: {
          hp: "number",
          mana: "number",
        },
        quanta: [
          { id: "q1", state: "IDLE", brane: { hp: 100, mana: 50 } },
          { id: "q2", state: "IDLE", brane: { hp: 100, mana: 10 } },
          { id: "q3", state: "IDLE", brane: { hp: 30, mana: 50 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти в состояние COMBAT (оба условия выполнены)
      expect(result.states![0]).toBe("COMBAT")
      // Агент 2 должен остаться в состоянии IDLE (mana = 10 не > 20)
      expect(result.states![1]).toBe("IDLE")
      // Агент 3 должен остаться в состоянии IDLE (hp = 30 не > 50)
      expect(result.states![2]).toBe("IDLE")
    })
  })

  describe("Обновление браны", () => {
    test("должен перейти после обновления браны", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          IDLE: {
            DEAD: { hp: { lte: 0 } },
          },
          DEAD: null,
        },
        branes: {
          hp: "number",
        },
        quanta: [{ id: "q1", state: "IDLE", brane: { hp: 100 } }],
        updates: [{ agentIndex: 0, fieldName: "hp", value: 0 }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент должен перейти в состояние DEAD после обновления браны (hp = 0)
      expect(result.states![0]).toBe("DEAD")
    })

    test("не должен перейти после обновления браны если условие не выполнено", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          IDLE: {
            PATROL: { hp: { gt: 50 } },
          },
          PATROL: null,
        },
        branes: {
          hp: "number",
        },
        quanta: [{ id: "q1", state: "IDLE", brane: { hp: 100 } }],
        updates: [{ agentIndex: 0, fieldName: "hp", value: 50 }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент должен остаться в состоянии IDLE после обновления браны (hp = 50 не > 50)
      expect(result.states![0]).toBe("IDLE")
    })
  })

  describe("Многошаговая симуляция", () => {
    test("должен пройти через несколько состояний", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          IDLE: {
            PATROL: { hp: { gt: 50 } },
          },
          PATROL: {
            COMBAT: { mana: { lt: 10 } },
          },
          COMBAT: null,
        },
        branes: {
          hp: "number",
          mana: "number",
        },
        quanta: [{ id: "q1", state: "IDLE", brane: { hp: 100, mana: 5 } }],
        steps: 2,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // После 2 шагов агент должен перейти из IDLE -> PATROL -> COMBAT
      expect(result.states![0]).toBe("COMBAT")
    })
  })

  describe("Пограничные случаи", () => {
    test("должен обработать несколько агентов с одинаковым начальным состоянием", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          IDLE: {
            ACTIVE: { hp: { gt: 0 } },
          },
          ACTIVE: null,
        },
        branes: {
          hp: "number",
        },
        quanta: [
          { id: "q1", state: "IDLE", brane: { hp: 100 } },
          { id: "q2", state: "IDLE", brane: { hp: 200 } },
          { id: "q3", state: "IDLE", brane: { hp: 0 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агенты 1 и 2 должны перейти в состояние ACTIVE (hp > 0)
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("ACTIVE")
      // Агент 3 должен остаться в состоянии IDLE (hp = 0 не > 0)
      expect(result.states![2]).toBe("IDLE")
    })

    test("должен обработать агентов с разными начальными состояниями", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          IDLE: {
            ACTIVE: { hp: { gt: 50 } },
          },
          ACTIVE: {
            IDLE: { hp: { lte: 50 } },
          },
        },
        branes: {
          hp: "number",
        },
        quanta: [
          { id: "q1", state: "IDLE", brane: { hp: 100 } },
          { id: "q2", state: "ACTIVE", brane: { hp: 30 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти из состояния IDLE в ACTIVE (hp = 100 > 50)
      expect(result.states![0]).toBe("ACTIVE")
      // Агент 2 должен перейти из состояния ACTIVE в IDLE (hp = 30 <= 50)
      expect(result.states![1]).toBe("IDLE")
    })
  })
})
