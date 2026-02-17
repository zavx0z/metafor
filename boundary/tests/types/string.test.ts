import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BoundaryTestFixture } from "../fixture"

describe("Boundary - STRING type (string)", () => {
  beforeAll(async () => await BoundaryTestFixture.setup())
  afterAll(async () => await BoundaryTestFixture.teardown(), 20000)
  const fixture = new BoundaryTestFixture()

  // STRING type uses interning via StringAtlas.
  // Strings are stored as [stringId, hash] for fast comparison on GPU.

  describe("EQ operator (equals)", () => {
    test("should transition when value equals specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "hero" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { name: "hero" }, superposition },
          { id: "q2", state: "IDLE", brane: { name: "monster" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "hero" == "hero"
      expect(result.states![1]).toBe("IDLE") // "monster" != "hero"
    })
  })

  describe("NEQ operator (not equals)", () => {
    test("should transition when value not equals specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { neq: "enemy" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { name: "enemy" }, superposition },
          { id: "q2", state: "IDLE", brane: { name: "ally" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // "enemy" == "enemy"
      expect(result.states![1]).toBe("ACTIVE") // "ally" != "enemy"
    })
  })

  describe("IN operator (in list)", () => {
    test("should transition if value is in list", async () => {
      const superposition = {
        IDLE: { ACTIVE: { role: { in: ["warrior", "mage", "rogue"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { role: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { role: "warrior" }, superposition },
          { id: "q2", state: "IDLE", brane: { role: "mage" }, superposition },
          { id: "q3", state: "IDLE", brane: { role: "healer" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "warrior" in [...]
      expect(result.states![1]).toBe("ACTIVE") // "mage" in [...]
      expect(result.states![2]).toBe("IDLE") // "healer" not in [...]
    })
  })

  describe("String value updates", () => {
    test("should correctly apply update for strings and handle IN", async () => {
      const superposition = {
        IDLE: { ACTIVE: { role: { in: ["warrior", "mage"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { role: { type: "string" } },
        branes: [{ id: "q1", state: "IDLE", brane: { role: "healer" }, superposition }],
        updates: [{ braneIndex: 0, componentName: "role", value: "warrior" }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
    })
  })

  describe("NOT_IN operator (not in list)", () => {
    test("should transition if value is not in list", async () => {
      const superposition = {
        IDLE: { ACTIVE: { role: { notIn: ["enemy", "boss"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { role: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { role: "enemy" }, superposition },
          { id: "q2", state: "IDLE", brane: { role: "boss" }, superposition },
          { id: "q3", state: "IDLE", brane: { role: "ally" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // "enemy" in [enemy, boss]
      expect(result.states![1]).toBe("IDLE") // "boss" in [enemy, boss]
      expect(result.states![2]).toBe("ACTIVE") // "ally" not in [enemy, boss]
    })
  })

  describe("Empty strings", () => {
    test("should correctly handle empty string", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { name: "" }, superposition },
          { id: "q2", state: "IDLE", brane: { name: "hero" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "" == ""
      expect(result.states![1]).toBe("IDLE") // "hero" != ""
    })
  })

  describe("Special characters", () => {
    test("should correctly handle strings with special characters", async () => {
      const superposition = {
        IDLE: { ACTIVE: { code: { eq: "test-123_@#" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { code: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { code: "test-123_@#" }, superposition },
          { id: "q2", state: "IDLE", brane: { code: "test-123" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("IDLE")
    })
  })

  describe("Case sensitivity", () => {
    test("should consider case when comparing", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "Hero" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { name: "Hero" }, superposition },
          { id: "q2", state: "IDLE", brane: { name: "hero" }, superposition },
          { id: "q3", state: "IDLE", brane: { name: "HERO" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "Hero" == "Hero"
      expect(result.states![1]).toBe("IDLE") // "hero" != "Hero"
      expect(result.states![2]).toBe("IDLE") // "HERO" != "Hero"
    })
  })
})
