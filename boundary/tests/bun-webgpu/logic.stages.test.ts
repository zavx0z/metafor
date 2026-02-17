import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../fixture/bunWebGPU"
import { Boundary } from "../../src/index"

describe("Boundary - Logic stages (bun-webgpu)", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  describe("IN operator (Lists)", () => {
    test("should transition if value is in list (int/enum)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        GROUND: {
          AIR: { mode: { in: [3] } }, // FLY
          MOVING: { mode: { in: [1, 2] } }, // WALK, RUN
        },
        AIR: null,
        MOVING: null,
      }

      await boundary.init({
        fields: { mode: { type: "number" } },
        branes: [
          { id: "q1", state: "GROUND", fields: { mode: 1 }, superposition }, // WALK -> MOVING
          { id: "q2", state: "GROUND", fields: { mode: 3 }, superposition }, // FLY -> AIR
          { id: "q3", state: "GROUND", fields: { mode: 0 }, superposition }, // IDLE -> stays
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("MOVING")
      expect(states[1]).toBe("AIR")
      expect(states[2]).toBe("GROUND")
    })

    test("should transition if float value is in list", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        NORMAL: {
          CRITICAL: { temperature: { in: [36.6, 40.0] } },
        },
        CRITICAL: null,
      }

      await boundary.init({
        fields: { temperature: { type: "number" } },
        branes: [
          { id: "q1", state: "NORMAL", fields: { temperature: 36.6 }, superposition },
          { id: "q2", state: "NORMAL", fields: { temperature: 37.0 }, superposition },
          { id: "q3", state: "NORMAL", fields: { temperature: 40.0 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("CRITICAL") // 36.6 found
      expect(states[1]).toBe("NORMAL") // 37.0 not found
      expect(states[2]).toBe("CRITICAL") // 40.0 found
    })
  })

  describe("NOT_IN operator (Exclusion)", () => {
    test("should transition if value is NOT in list", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        LOBBY: {
          GAME: { role: { notIn: [0] } }, // 0 = Spectator (not playing)
        },
        GAME: null,
      }

      await boundary.init({
        fields: { role: { type: "number" } },
        branes: [
          { id: "q1", state: "LOBBY", fields: { role: 1 }, superposition }, // Player -> GAME
          { id: "q2", state: "LOBBY", fields: { role: 0 }, superposition }, // Spectator -> LOBBY
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("GAME")
      expect(states[1]).toBe("LOBBY")
    })
  })

  describe("Combined conditions", () => {
    test("should work with combination of ranges and lists", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        START: {
          WIN: {
            score: { gt: 100 },
            badge: { in: [5, 7] }, // 5=Gold, 7=Platinum
          },
        },
        WIN: null,
      }

      await boundary.init({
        fields: { score: { type: "number" }, badge: { type: "number" } },
        branes: [
          { id: "q1", state: "START", fields: { score: 150, badge: 5 }, superposition }, // OK
          { id: "q2", state: "START", fields: { score: 150, badge: 1 }, superposition }, // Badge doesn't match
          { id: "q3", state: "START", fields: { score: 50, badge: 7 }, superposition }, // Score doesn't match
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("WIN")
      expect(states[1]).toBe("START")
      expect(states[2]).toBe("START")
    })
  })
})