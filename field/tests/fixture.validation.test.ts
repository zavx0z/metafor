import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test"
import { QuantumFieldTestFixture } from "./fixture"

describe("Тесты валидации фикстуры", () => {
  let fixture: QuantumFieldTestFixture

  beforeAll(async () => {
    await QuantumFieldTestFixture.setup()
  })

  afterAll(async () => {
    await QuantumFieldTestFixture.teardown()
  }, 20000)

  beforeEach(() => {
    fixture = new QuantumFieldTestFixture()
  })

  describe("Данные из примера Client.ts", () => {
    test('должен вернуть ["IDLE", "DEAD"] после обновления и шага', async () => {
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
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        quanta: [
          { id: "q1", state: "IDLE", context: { hp: 100, mana: 100, isAlive: true } },
          { id: "q2", state: "IDLE", context: { hp: 0, mana: 50, isAlive: false } },
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

    test('должен начинаться с ["IDLE", "IDLE"] до обновления', async () => {
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
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        quanta: [
          { id: "q1", state: "IDLE", context: { hp: 100, mana: 100, isAlive: true } },
          { id: "q2", state: "IDLE", context: { hp: 0, mana: 50, isAlive: false } },
        ],
        steps: 0,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
      expect(result.states![1]).toBe("IDLE")
    })

    test("должен немедленно перевести квант q2 в состояние DEAD (hp=0)", async () => {
      const testData = {
        statesConfig: {
          IDLE: {
            DEAD: { hp: { lte: 0 } },
          },
          DEAD: null,
        },
        contextSchema: {
          hp: { type: "number" },
        },
        quanta: [{ id: "q2", state: "IDLE", context: { hp: 0 } }],
        steps: 1,
        debug: true,
      }

      // console.log('[DEBUG] Конфигурация теста:', JSON.stringify(testData, null, 2))
      // console.log('[DEBUG] Значение hp:', testData.quanta[0]!.context?.hp)
      // console.log('[DEBUG] Ожидаемый переход: IDLE -> DEAD потому что hp <= 0')

      const result = await fixture.runSimulation(testData)

      // console.log('[DEBUG] Результат теста:', JSON.stringify(result))
      // console.log('[DEBUG] Фактическое состояние:', result.states![0])

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD")
    })

    test("должен перейти в состояние DEAD когда здоровье отрицательное", async () => {
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
        quanta: [{ id: "q1", state: "IDLE", context: { hp: -10 } }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD")
    })

    test("НЕ должен перейти в состояние DEAD когда здоровье положительное", async () => {
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
        quanta: [{ id: "q1", state: "IDLE", context: { hp: 10 } }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
    })

    test("должен оставить квант q1 в состоянии IDLE когда здоровье = 50 (не >50 и не <=0)", async () => {
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
        quanta: [{ id: "q1", state: "IDLE", context: { hp: 50 } }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
    })
  })
})
