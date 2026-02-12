import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test"
import { BoundaryTestFixture } from "./fixture"

describe("Тесты валидации фикстуры", () => {
  let fixture: BoundaryTestFixture

  beforeAll(async () => {
    await BoundaryTestFixture.setup()
  })

  afterAll(async () => {
    await BoundaryTestFixture.teardown()
  }, 20000)

  beforeEach(() => {
    fixture = new BoundaryTestFixture()
  })

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

  describe("Данные из примера Client.ts", () => {
    test('должен вернуть ["IDLE", "DEAD"] после обновления и шага', async () => {
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
        updates: [{ fieldIndex: 0, componentName: "hp", value: 50 }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Поле 0: начальное состояние IDLE, hp=100
      // После обновления: hp=50
      // Условия из состояния IDLE:
      //   - PATROL: hp > 50 (50 не > 50) → не срабатывает
      //   - DEAD: hp <= 0 (50 не <= 0) → не срабатывает
      // Результат: остается в IDLE
      expect(result.states![0]).toBe("IDLE")

      // Поле 1: начальное состояние IDLE, hp=0
      // Условия из состояния IDLE:
      //   - PATROL: hp > 50 (0 не > 50) → не срабатывает
      //   - DEAD: hp <= 0 (0 <= 0) → срабатывает!
      // Результат: переходит в DEAD
      expect(result.states![1]).toBe("DEAD")
    })

    test('должен начинаться с ["IDLE", "IDLE"] до обновления', async () => {
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
        steps: 0,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
      expect(result.states![1]).toBe("IDLE")
    })

    test("должен немедленно перевести поле q2 в состояние DEAD (hp=0)", async () => {
      const superposition = {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      }
      const testData = {
        branes: {
          hp: { type: "number" },
        },
        fields: [{ id: "q2", state: "IDLE", brane: { hp: 0 }, superposition }],
        steps: 1,
      }

      const result = await fixture.runSimulation(testData)

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD")
    })

    test("должен перейти в состояние DEAD когда здоровье отрицательное", async () => {
      const superposition = {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [{ id: "q1", state: "IDLE", brane: { hp: -10 }, superposition }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD")
    })

    test("НЕ должен перейти в состояние DEAD когда здоровье положительное", async () => {
      const superposition = {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [{ id: "q1", state: "IDLE", brane: { hp: 10 }, superposition }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
    })

    test("должен оставить поле q1 в состоянии IDLE когда здоровье = 50 (не >50 и не <=0)", async () => {
      const superposition = {
        IDLE: {
          PATROL: { hp: { gt: 50 } },
          DEAD: { hp: { lte: 0 } },
        },
        PATROL: null,
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        branes: {
          hp: "number",
        },
        fields: [{ id: "q1", state: "IDLE", brane: { hp: 50 }, superposition }],
        steps: 1,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
    })
  })
})
