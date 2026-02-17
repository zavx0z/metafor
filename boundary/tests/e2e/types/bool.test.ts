import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BrowserWebGPU } from "../../fixture/browserWebGPU"

describe("Boundary - BOOL type (boolean)", () => {
  beforeAll(async () => await BrowserWebGPU.setup())
  afterAll(async () => await BrowserWebGPU.teardown(), 20000)
  const fixture = new BrowserWebGPU()

  describe("Direct value true", () => {
    test("should transition when value is true", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // true == true
      expect(result.states![1]).toBe("IDLE") // false != true
    })
  })

  describe("Direct value false", () => {
    test("should transition when value is false", async () => {
      const superposition = {
        IDLE: { DEAD: { isAlive: false } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD") // false == false
      expect(result.states![1]).toBe("IDLE") // true != false
    })
  })

  describe("EQ operator (equals)", () => {
    test("should transition when value equals true", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: { eq: true } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // true == true
      expect(result.states![1]).toBe("IDLE") // false != true
    })

    test("should transition when value equals false", async () => {
      const superposition = {
        IDLE: { DEAD: { isAlive: { eq: false } } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD") // false == false
      expect(result.states![1]).toBe("IDLE") // true != false
    })
  })

  describe("NEQ operator (not equals)", () => {
    test("should transition when value not equals true", async () => {
      const superposition = {
        IDLE: { DEAD: { isAlive: { neq: true } } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // true == true
      expect(result.states![1]).toBe("DEAD") // false != true
    })

    test("should transition when value not equals false", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: { neq: false } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // false == false
      expect(result.states![1]).toBe("ACTIVE") // true != false
    })
  })

  describe("Multiple boolean conditions", () => {
    test("should transition when all conditions are met (AND)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: true, hasMana: true } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { isAlive: { type: "boolean" }, hasMana: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { isAlive: true, hasMana: true }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true, hasMana: false }, superposition },
          { id: "q3", state: "IDLE", brane: { isAlive: false, hasMana: true }, superposition },
          { id: "q4", state: "IDLE", brane: { isAlive: false, hasMana: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // true && true
      expect(result.states![1]).toBe("IDLE") // true && false
      expect(result.states![2]).toBe("IDLE") // false && true
      expect(result.states![3]).toBe("IDLE") // false && false
    })

    test("should transition with different boolean value combinations", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: true, isStunned: false } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { isAlive: { type: "boolean" }, isStunned: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { isAlive: true, isStunned: false }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true, isStunned: true }, superposition },
          { id: "q3", state: "IDLE", brane: { isAlive: false, isStunned: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // true && !false
      expect(result.states![1]).toBe("IDLE") // true && !true
      expect(result.states![2]).toBe("IDLE") // false && !false
    })
  })

  describe("Boolean value updates", () => {
    test("should transition after updating value to true", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isReady: true } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { isReady: { type: "boolean" } },
        branes: [{ id: "q1", state: "IDLE", brane: { isReady: false }, superposition }],
        updates: [{ braneIndex: 0, componentName: "isReady", value: true }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // After update isReady = true
    })

    test("should transition after updating value to false", async () => {
      const superposition = {
        IDLE: { DEAD: { isAlive: false } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        fields: { isAlive: { type: "boolean" } },
        branes: [{ id: "q1", state: "IDLE", brane: { isAlive: true }, superposition }],
        updates: [{ braneIndex: 0, componentName: "isAlive", value: false }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD") // After update isAlive = false
    })
  })

  describe("Mixed conditions (boolean + number)", () => {
    test("should transition when both conditions of different types are met", async () => {
      const superposition = {
        IDLE: { COMBAT: { isAlive: true, hp: { gt: 50 } } },
        COMBAT: null,
      }
      const result = await fixture.runSimulation({
        fields: { isAlive: { type: "boolean" }, hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { isAlive: true, hp: 100 }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true, hp: 30 }, superposition },
          { id: "q3", state: "IDLE", brane: { isAlive: false, hp: 100 }, superposition },
          { id: "q4", state: "IDLE", brane: { isAlive: false, hp: 30 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("COMBAT") // true && 100 > 50
      expect(result.states![1]).toBe("IDLE") // true && 30 not > 50
      expect(result.states![2]).toBe("IDLE") // false && 100 > 50
      expect(result.states![3]).toBe("IDLE") // false && 30 not > 50
    })
  })
})
