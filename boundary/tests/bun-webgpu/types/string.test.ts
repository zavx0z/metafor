import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../../fixture/bunWebGPU"
import { Boundary } from "../../../src/index"

describe("Boundary - STRING type with bun-webgpu", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  // STRING type uses interning via StringAtlas.
  // Strings are stored as [stringId, hash] for fast GPU comparison.

  describe("EQ operator (equals)", () => {
    test("should transition when value equals specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "hero" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "hero" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "monster" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("NEQ operator (not equals)", () => {
    test("should transition when value does not equal specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { name: { neq: "enemy" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "enemy" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "ally" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
    })
  })

  describe("IN operator (in list)", () => {
    test("should transition if value is in list", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { role: { in: ["warrior", "mage", "rogue"] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { role: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { role: "warrior" }, superposition },
          { id: "q2", state: "IDLE", fields: { role: "mage" }, superposition },
          { id: "q3", state: "IDLE", fields: { role: "healer" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("String value updates", () => {
    test("should correctly apply string update and handle IN", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { role: { in: ["warrior", "mage"] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { role: { type: "string" } },
        branes: [{ id: "q1", state: "IDLE", fields: { role: "healer" }, superposition }],
      })

      boundary.updateBraneField(0, "role", "warrior")
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })
  })

  describe("NOT_IN operator (not in list)", () => {
    test("should transition if value is not in list", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { role: { notIn: ["enemy", "boss"] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { role: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { role: "enemy" }, superposition },
          { id: "q2", state: "IDLE", fields: { role: "boss" }, superposition },
          { id: "q3", state: "IDLE", fields: { role: "ally" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Empty strings", () => {
    test("should correctly handle empty string", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "hero" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Special characters", () => {
    test("should correctly handle strings with special characters", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { code: { eq: "test-123_@#" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { code: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { code: "test-123_@#" }, superposition },
          { id: "q2", state: "IDLE", fields: { code: "test-123" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Case sensitivity", () => {
    test("should be case sensitive when comparing", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "Hero" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "Hero" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "hero" }, superposition },
          { id: "q3", state: "IDLE", fields: { name: "HERO" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })
})