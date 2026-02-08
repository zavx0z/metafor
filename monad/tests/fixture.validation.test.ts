import { test, expect, beforeAll, afterAll, describe } from "bun:test"
import { MonadTestFixture } from "./monad.fixture"

// Инициализируем фикстуру один раз перед всеми тестами
beforeAll(async () => {
  await MonadTestFixture.setup()
})

// Закрываем фикстуру один раз после всех тестов
afterAll(async () => {
  await MonadTestFixture.teardown()
})

describe("Fixture Validation Tests", () => {
  const fixture = new MonadTestFixture()

  describe("Client.ts Example Data", () => {
    test('should produce ["IDLE", "DEAD"] after update and step', async () => {
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
        updates: [{ agentIndex: 0, fieldName: "hp", value: 50 }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Агент 0: начальное состояние IDLE, hp=100
      // После обновления: hp=50
      // Условия из состояния IDLE:
      //   - PATROL: hp > 50 (50 не > 50) → не срабатывает
      //   - DEAD: hp <= 0 (50 не <= 0) → не срабатывает
      // Результат: остается в IDLE
      expect(result.states![0]).toBe("IDLE")

      // Агент 1: начальное состояние IDLE, hp=0
      // Условия из состояния IDLE:
      //   - PATROL: hp > 50 (0 не > 50) → не срабатывает
      //   - DEAD: hp <= 0 (0 <= 0) → срабатывает!
      // Результат: переходит в DEAD
      expect(result.states![1]).toBe("DEAD")
    })

    test('should start with ["IDLE", "IDLE"] before update', async () => {
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
        steps: 0,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
      expect(result.states![1]).toBe("IDLE")
    })

    test("should transition m2 to DEAD immediately (hp=0)", async () => {
      const testData = {
        statesConfig: {
          IDLE: {
            DEAD: { hp: { lte: 0 } },
          },
          DEAD: null,
        },
        contextSchema: {
          hp: "number",
        },
        monads: [{ id: "m2", state: "IDLE", context: { hp: 0 } }],
        steps: 1,
        debug: true,
      }

      console.log('[DEBUG] Test config:', JSON.stringify(testData, null, 2))
      console.log('[DEBUG] hp value:', testData.monads[0].context.hp)
      console.log('[DEBUG] Expected transition: IDLE -> DEAD because hp <= 0')
      
      const result = await fixture.runSimulation(testData)

      console.log('[DEBUG] Test result:', JSON.stringify(result))
      console.log('[DEBUG] Actual state:', result.states![0])
      
      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD")
    })

    test("should transition to DEAD when hp is negative", async () => {
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
        monads: [{ id: "m1", state: "IDLE", context: { hp: -10 } }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD")
    })

    test("should NOT transition to DEAD when hp is positive", async () => {
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
        monads: [{ id: "m1", state: "IDLE", context: { hp: 10 } }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
    })

    test("should keep m1 in IDLE when hp=50 (not >50 and not <=0)", async () => {
      const result = await fixture.runSimulation({
        statesConfig: {
          IDLE: {
            PATROL: { hp: { gt: 50 } },
            DEAD: { hp: { lte: 0 } },
          },
          PATROL: null,
          DEAD: null,
        },
        contextSchema: {
          hp: "number",
        },
        monads: [{ id: "m1", state: "IDLE", context: { hp: 50 } }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
    })
  })
})
