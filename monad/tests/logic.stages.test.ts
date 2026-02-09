import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test"
import { MonadTestFixture } from "./fixture"

describe("MonadSystem — Логика новых этапов (GPU)", () => {
  beforeAll(async () => await MonadTestFixture.setup())
  afterAll(async () => await MonadTestFixture.teardown(), 20000)
  const fixture = new MonadTestFixture()
  const ensureAvailable = () => {
    if (!MonadTestFixture.isAvailable()) {
      const error = MonadTestFixture.getSetupError()
      console.warn(`Skipping GPU tests: ${error?.message ?? "fixture unavailable"}`)
      return false
    }
    return true
  }

  describe("Оператор IN (Списки)", () => {
    test("должен переходить, если значение есть в списке (Integer/Enum)", async () => {
      if (!ensureAvailable()) return
      // Эмуляция Enum: 0=IDLE, 1=WALK, 2=RUN, 3=FLY
      const result = await fixture.runSimulation({
        statesConfig: {
          GROUND: {
            AIR: { mode: { in: [3] } }, // FLY
            MOVING: { mode: { in: [1, 2] } }, // WALK, RUN
          },
          AIR: null,
          MOVING: null,
        },
        contextSchema: { mode: { type: "integer" } },
        monads: [
          { id: "m1", state: "GROUND", context: { mode: 1 } }, // WALK -> MOVING
          { id: "m2", state: "GROUND", context: { mode: 3 } }, // FLY -> AIR
          { id: "m3", state: "GROUND", context: { mode: 0 } }, // IDLE -> остаться
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("MOVING")
      expect(result.states![1]).toBe("AIR")
      expect(result.states![2]).toBe("GROUND")
    })

    test("должен переходить, если float значение есть в списке", async () => {
      if (!ensureAvailable()) return
      const result = await fixture.runSimulation({
        statesConfig: {
          NORMAL: {
            CRITICAL: { temperature: { in: [36.6, 40.0] } },
          },
          CRITICAL: null,
        },
        contextSchema: { temperature: { type: "float" } },
        monads: [
          { id: "m1", state: "NORMAL", context: { temperature: 36.6 } },
          { id: "m2", state: "NORMAL", context: { temperature: 37.0 } },
          { id: "m3", state: "NORMAL", context: { temperature: 40.0 } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("CRITICAL") // 36.6 found
      expect(result.states![1]).toBe("NORMAL") // 37.0 not found
      expect(result.states![2]).toBe("CRITICAL") // 40.0 found
    })
  })

  describe("Оператор NOT_IN (Исключение)", () => {
    test("должен переходить, если значения НЕТ в списке", async () => {
      if (!ensureAvailable()) return
      const result = await fixture.runSimulation({
        statesConfig: {
          LOBBY: {
            GAME: { role: { notIn: [0] } }, // 0 = Spectator (не играет)
          },
          GAME: null,
        },
        contextSchema: { role: { type: "integer" } },
        monads: [
          { id: "m1", state: "LOBBY", context: { role: 1 } }, // Player -> GAME
          { id: "m2", state: "LOBBY", context: { role: 0 } }, // Spectator -> LOBBY
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("GAME")
      expect(result.states![1]).toBe("LOBBY")
    })
  })

  describe("Комбинированные условия", () => {
    test("должен работать mix из диапазонов и списков", async () => {
      if (!ensureAvailable()) return
      const result = await fixture.runSimulation({
        statesConfig: {
          START: {
            WIN: {
              score: { gt: 100 },
              badge: { in: [5, 7] }, // 5=Gold, 7=Platinum
            },
          },
          WIN: null,
        },
        contextSchema: { score: { type: "integer" }, badge: { type: "integer" } },
        monads: [
          { id: "m1", state: "START", context: { score: 150, badge: 5 } }, // OK
          { id: "m2", state: "START", context: { score: 150, badge: 1 } }, // Badge fail
          { id: "m3", state: "START", context: { score: 50, badge: 7 } }, // Score fail
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("WIN")
      expect(result.states![1]).toBe("START")
      expect(result.states![2]).toBe("START")
    })
  })
})
