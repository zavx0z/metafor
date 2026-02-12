import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test"
import { QuantumFieldTestFixture } from "./fixture"

describe("QuantumFieldSystem — Логика новых этапов (GPU)", () => {
  beforeAll(async () => await QuantumFieldTestFixture.setup())
  afterAll(async () => await QuantumFieldTestFixture.teardown(), 20000)
  const fixture = new QuantumFieldTestFixture()

  describe("Оператор IN (Списки)", () => {
    test("должен переходить, если значение есть в списке (Integer/Enum)", async () => {
      // Эмуляция Enum: 0=IDLE, 1=WALK, 2=RUN, 3=FLY
      const result = await fixture.runSimulation({
        superposition: {
          GROUND: {
            AIR: { mode: { in: [3] } }, // FLY
            MOVING: { mode: { in: [1, 2] } }, // WALK, RUN
          },
          AIR: null,
          MOVING: null,
        },
        branes: { mode: { type: "number" } },
        quanta: [
          { id: "q1", state: "GROUND", brane: { mode: 1 } }, // WALK -> MOVING
          { id: "q2", state: "GROUND", brane: { mode: 3 } }, // FLY -> AIR
          { id: "q3", state: "GROUND", brane: { mode: 0 } }, // IDLE -> остаться
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("MOVING")
      expect(result.states![1]).toBe("AIR")
      expect(result.states![2]).toBe("GROUND")
    })

    test("должен переходить, если float значение есть в списке", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          NORMAL: {
            CRITICAL: { temperature: { in: [36.6, 40.0] } },
          },
          CRITICAL: null,
        },
        branes: { temperature: { type: "number" } },
        quanta: [
          { id: "q1", state: "NORMAL", brane: { temperature: 36.6 } },
          { id: "q2", state: "NORMAL", brane: { temperature: 37.0 } },
          { id: "q3", state: "NORMAL", brane: { temperature: 40.0 } },
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
      const result = await fixture.runSimulation({
        superposition: {
          LOBBY: {
            GAME: { role: { notIn: [0] } }, // 0 = Spectator (не играет)
          },
          GAME: null,
        },
        branes: { role: { type: "number" } },
        quanta: [
          { id: "q1", state: "LOBBY", brane: { role: 1 } }, // Player -> GAME
          { id: "q2", state: "LOBBY", brane: { role: 0 } }, // Spectator -> LOBBY
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("GAME")
      expect(result.states![1]).toBe("LOBBY")
    })
  })

  describe("Комбинированные условия", () => {
    test("должен работать mix из диапазонов и списков", async () => {
      const result = await fixture.runSimulation({
        superposition: {
          START: {
            WIN: {
              score: { gt: 100 },
              badge: { in: [5, 7] }, // 5=Gold, 7=Platinum
            },
          },
          WIN: null,
        },
        branes: { score: { type: "number" }, badge: { type: "number" } },
        quanta: [
          { id: "q1", state: "START", brane: { score: 150, badge: 5 } }, // OK
          { id: "q2", state: "START", brane: { score: 150, badge: 1 } }, // Badge fail
          { id: "q3", state: "START", brane: { score: 50, badge: 7 } }, // Score fail
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("WIN")
      expect(result.states![1]).toBe("START")
      expect(result.states![2]).toBe("START")
    })
  })
})
