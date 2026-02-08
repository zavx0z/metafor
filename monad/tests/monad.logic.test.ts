import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { MonadTestFixture } from "./monad.fixture"

// Инициализируем фикстуру один раз перед всеми тестами
beforeAll(async () => {
  await MonadTestFixture.setup()
})

// Закрываем фикстуру один раз после всех тестов
afterAll(async () => {
  await MonadTestFixture.teardown()
})

describe("MonadSystem Logic Tests (Real GPU)", () => {
  const fixture = new MonadTestFixture()

  describe("Basic State Transitions", () => {
    test("should transition from IDLE to DEAD when hp <= 0", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
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
        contextSchema: {
          hp: "number",
          mana: "number",
          isAlive: "boolean",
        },
        monads: [
          { id: "m1", state: "IDLE", context: { hp: 100, mana: 100, isAlive: true } },
          { id: "m2", state: "IDLE", context: { hp: 0, mana: 50, isAlive: false } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      expect(result.states![0]).toBe("IDLE")
      expect(result.states![1]).toBe("DEAD")
    })

    test("should transition from IDLE to PATROL when hp > 50", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            PATROL: { hp: { gt: 50 } },
          },
          PATROL: null,
        },
        contextSchema: {
          hp: "number",
        },
        monads: [
          { id: "m1", state: "IDLE", context: { hp: 100 } },
          { id: "m2", state: "IDLE", context: { hp: 50 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти в состояние PATROL (hp = 100 > 50)
      expect(result.states![0]).toBe("PATROL")
      // Агент 2 должен остаться в состоянии IDLE (hp = 50 не > 50)
      expect(result.states![1]).toBe("IDLE")
    })

    test("should transition from IDLE to PATROL when hp >= 50", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            PATROL: { hp: { gte: 50 } },
          },
          PATROL: null,
        },
        contextSchema: {
          hp: "number",
        },
        monads: [
          { id: "m1", state: "IDLE", context: { hp: 50 } },
          { id: "m2", state: "IDLE", context: { hp: 49 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти в состояние PATROL (hp = 50 >= 50)
      expect(result.states![0]).toBe("PATROL")
      // Агент 2 должен остаться в состоянии IDLE (hp = 49 не >= 50)
      expect(result.states![1]).toBe("IDLE")
    })

    test("should transition from IDLE to PATROL when hp < 50", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            PATROL: { hp: { lt: 50 } },
          },
          PATROL: null,
        },
        contextSchema: {
          hp: "number",
        },
        monads: [
          { id: "m1", state: "IDLE", context: { hp: 49 } },
          { id: "m2", state: "IDLE", context: { hp: 50 } },
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

  describe("Boolean Conditions", () => {
    test("should transition when boolean field is true", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            ACTIVE: { isAlive: true },
          },
          ACTIVE: null,
        },
        contextSchema: {
          isAlive: "boolean",
        },
        monads: [
          { id: "m1", state: "IDLE", context: { isAlive: true } },
          { id: "m2", state: "IDLE", context: { isAlive: false } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти в состояние ACTIVE (isAlive = true)
      expect(result.states![0]).toBe("ACTIVE")
      // Агент 2 должен остаться в состоянии IDLE (isAlive = false)
      expect(result.states![1]).toBe("IDLE")
    })

    test("should transition when boolean field is false", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          ACTIVE: {
            DEAD: { isAlive: false },
          },
          DEAD: null,
        },
        contextSchema: {
          isAlive: "boolean",
        },
        monads: [
          { id: "m1", state: "ACTIVE", context: { isAlive: false } },
          { id: "m2", state: "ACTIVE", context: { isAlive: true } },
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

  describe("Multiple Conditions", () => {
    test("should transition when both conditions are met", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            COMBAT: {
              hp: { gt: 50 },
              mana: { gt: 20 },
            },
          },
          COMBAT: null,
        },
        contextSchema: {
          hp: "number",
          mana: "number",
        },
        monads: [
          { id: "m1", state: "IDLE", context: { hp: 100, mana: 50 } },
          { id: "m2", state: "IDLE", context: { hp: 100, mana: 10 } },
          { id: "m3", state: "IDLE", context: { hp: 30, mana: 50 } },
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

  describe("Update Context", () => {
    test("should transition after context update", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            DEAD: { hp: { lte: 0 } },
          },
          DEAD: null,
        },
        contextSchema: {
          hp: "number",
        },
        monads: [{ id: "m1", state: "IDLE", context: { hp: 100 } }],
        updates: [{ agentIndex: 0, fieldName: "hp", value: 0 }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент должен перейти в состояние DEAD после обновления контекста (hp = 0)
      expect(result.states![0]).toBe("DEAD")
    })

    test("should not transition after context update if condition not met", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            PATROL: { hp: { gt: 50 } },
          },
          PATROL: null,
        },
        contextSchema: {
          hp: "number",
        },
        monads: [{ id: "m1", state: "IDLE", context: { hp: 100 } }],
        updates: [{ agentIndex: 0, fieldName: "hp", value: 50 }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент должен остаться в состоянии IDLE после обновления контекста (hp = 50 не > 50)
      expect(result.states![0]).toBe("IDLE")
    })
  })

  describe("Multi-step Simulation", () => {
    test("should transition through multiple states", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            PATROL: { hp: { gt: 50 } },
          },
          PATROL: {
            COMBAT: { mana: { lt: 10 } },
          },
          COMBAT: null,
        },
        contextSchema: {
          hp: "number",
          mana: "number",
        },
        monads: [{ id: "m1", state: "IDLE", context: { hp: 100, mana: 5 } }],
        steps: 2,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // После 2 шагов агент должен перейти из IDLE -> PATROL -> COMBAT
      expect(result.states![0]).toBe("COMBAT")
    })
  })

  describe("Edge Cases", () => {
    test("should handle multiple agents with same initial state", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            ACTIVE: { hp: { gt: 0 } },
          },
          ACTIVE: null,
        },
        contextSchema: {
          hp: "number",
        },
        monads: [
          { id: "m1", state: "IDLE", context: { hp: 100 } },
          { id: "m2", state: "IDLE", context: { hp: 200 } },
          { id: "m3", state: "IDLE", context: { hp: 0 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агенты 1 и 2 должны перейти в состояние ACTIVE
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("ACTIVE")
      // Агент 3 должен остаться в состоянии IDLE
      expect(result.states![2]).toBe("IDLE")
    })

    test("should handle agents with different initial states", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            ACTIVE: { hp: { gt: 50 } },
          },
          ACTIVE: {
            IDLE: { hp: { lte: 50 } },
          },
        },
        contextSchema: {
          hp: "number",
        },
        monads: [
          { id: "m1", state: "IDLE", context: { hp: 100 } },
          { id: "m2", state: "ACTIVE", context: { hp: 30 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 1 должен перейти из IDLE в ACTIVE (hp = 100 > 50)
      expect(result.states![0]).toBe("ACTIVE")
      // Агент 2 должен перейти из ACTIVE в IDLE (hp = 30 <= 50)
      expect(result.states![1]).toBe("IDLE")
    })
  })
})
