import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BrowserWebGPU } from "../fixture/browserWebGPU"

describe("Boundary - New stages logic (GPU)", () => {
  beforeAll(async () => await BrowserWebGPU.setup())
  afterAll(async () => await BrowserWebGPU.teardown(), 20000)
  const fixture = new BrowserWebGPU()

  describe("IN operator (Lists)", () => {
    test("should transition if value is in list (Integer/Enum)", async () => {
      const superposition = {
        GROUND: {
          AIR: { mode: { in: [3] } }, // FLY
          MOVING: { mode: { in: [1, 2] } }, // WALK, RUN
        },
        AIR: null,
        MOVING: null,
      }
      // Enum emulation: 0=IDLE, 1=WALK, 2=RUN, 3=FLY
      const result = await fixture.runSimulation({
        fields: { mode: { type: "number" } },
        branes: [
          { id: "q1", state: "GROUND", brane: { mode: 1 }, superposition }, // WALK -> MOVING
          { id: "q2", state: "GROUND", brane: { mode: 3 }, superposition }, // FLY -> AIR
          { id: "q3", state: "GROUND", brane: { mode: 0 }, superposition }, // IDLE -> stay
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("MOVING")
      expect(result.states![1]).toBe("AIR")
      expect(result.states![2]).toBe("GROUND")
    })

    test("should transition if float value is in list", async () => {
      const superposition = {
        NORMAL: {
          CRITICAL: { temperature: { in: [36.6, 40.0] } },
        },
        CRITICAL: null,
      }
      const result = await fixture.runSimulation({
        fields: { temperature: { type: "number" } },
        branes: [
          { id: "q1", state: "NORMAL", brane: { temperature: 36.6 }, superposition },
          { id: "q2", state: "NORMAL", brane: { temperature: 37.0 }, superposition },
          { id: "q3", state: "NORMAL", brane: { temperature: 40.0 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("CRITICAL") // 36.6 found
      expect(result.states![1]).toBe("NORMAL") // 37.0 not found
      expect(result.states![2]).toBe("CRITICAL") // 40.0 found
    })
  })

  describe("NOT_IN operator (Exclusion)", () => {
    test("should transition if value is NOT in list", async () => {
      const superposition = {
        LOBBY: {
          GAME: { role: { notIn: [0] } }, // 0 = Spectator (not playing)
        },
        GAME: null,
      }
      const result = await fixture.runSimulation({
        fields: { role: { type: "number" } },
        branes: [
          { id: "q1", state: "LOBBY", brane: { role: 1 }, superposition }, // Player -> GAME
          { id: "q2", state: "LOBBY", brane: { role: 0 }, superposition }, // Spectator -> LOBBY
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("GAME")
      expect(result.states![1]).toBe("LOBBY")
    })
  })

  describe("Combined conditions", () => {
    test("should work with mix of ranges and lists", async () => {
      const superposition = {
        START: {
          WIN: {
            score: { gt: 100 },
            badge: { in: [5, 7] }, // 5=Gold, 7=Platinum
          },
        },
        WIN: null,
      }
      const result = await fixture.runSimulation({
        fields: { score: { type: "number" }, badge: { type: "number" } },
        branes: [
          { id: "q1", state: "START", brane: { score: 150, badge: 5 }, superposition }, // OK
          { id: "q2", state: "START", brane: { score: 150, badge: 1 }, superposition }, // Badge fail
          { id: "q3", state: "START", brane: { score: 50, badge: 7 }, superposition }, // Score fail
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("WIN")
      expect(result.states![1]).toBe("START")
      expect(result.states![2]).toBe("START")
    })
  })
})
