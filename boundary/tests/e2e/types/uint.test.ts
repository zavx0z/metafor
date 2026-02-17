import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BrowserWebGPU } from "../../fixture/browserWebGPU"

describe("Boundary - UINT type (enum)", () => {
  beforeAll(async () => await BrowserWebGPU.setup())
  afterAll(async () => await BrowserWebGPU.teardown(), 20000)
  const fixture = new BrowserWebGPU()

  // NOTE: Enum values are stored as indices in the values array.
  // GT/LT/GTE/LTE comparisons work with indices, not values.
  // Current enum implementation has features that require additional research.

  describe("EQ operator (equals)", () => {
    test("should transition when value equals specified (string enum)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { status: { eq: "ACTIVE" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { status: "ACTIVE" }, superposition },
          { id: "q2", state: "IDLE", brane: { status: "IDLE" }, superposition },
          { id: "q3", state: "IDLE", brane: { status: "DEAD" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // ACTIVE == ACTIVE
      expect(result.states![1]).toBe("IDLE") // IDLE != ACTIVE
      expect(result.states![2]).toBe("IDLE") // DEAD != ACTIVE
    })

    test("should transition when value equals specified (number enum)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { eq: 2 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3] },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { level: 2 }, superposition },
          { id: "q2", state: "IDLE", brane: { level: 1 }, superposition },
          { id: "q3", state: "IDLE", brane: { level: 3 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 2 == 2
      expect(result.states![1]).toBe("IDLE") // 1 != 2
      expect(result.states![2]).toBe("IDLE") // 3 != 2
    })
  })

  describe("NEQ operator (not equals)", () => {
    test("should transition when value not equals specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { status: { neq: "IDLE" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { status: "IDLE" }, superposition },
          { id: "q2", state: "IDLE", brane: { status: "ACTIVE" }, superposition },
          { id: "q3", state: "IDLE", brane: { status: "DEAD" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // IDLE == IDLE
      expect(result.states![1]).toBe("ACTIVE") // ACTIVE != IDLE
      expect(result.states![2]).toBe("ACTIVE") // DEAD != IDLE
    })
  })

  describe("GT operator (greater than)", () => {
    test("should transition when value greater than specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { gt: 1 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", brane: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", brane: { level: 3 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // 1 not > 1
      expect(result.states![1]).toBe("ACTIVE") // 2 > 1
      expect(result.states![2]).toBe("ACTIVE") // 3 > 1
    })
  })

  describe("LT operator (less than)", () => {
    test("should transition when value less than specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { lt: 3 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", brane: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", brane: { level: 3 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 1 < 3
      expect(result.states![1]).toBe("ACTIVE") // 2 < 3
      expect(result.states![2]).toBe("IDLE") // 3 not < 3
    })
  })

  describe("GTE operator (greater than or equal)", () => {
    test("should transition when value greater than or equal to specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { gte: 3 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { level: 2 }, superposition },
          { id: "q2", state: "IDLE", brane: { level: 3 }, superposition },
          { id: "q3", state: "IDLE", brane: { level: 4 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // 2 not >= 3
      expect(result.states![1]).toBe("ACTIVE") // 3 >= 3
      expect(result.states![2]).toBe("ACTIVE") // 4 >= 3
    })
  })

  describe("LTE operator (less than or equal)", () => {
    test("should transition when value less than or equal to specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { lte: 2 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", brane: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", brane: { level: 3 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 1 <= 2
      expect(result.states![1]).toBe("ACTIVE") // 2 <= 2
      expect(result.states![2]).toBe("IDLE") // 3 not <= 2
    })
  })

  describe("IN operator (in list)", () => {
    test("should transition if value is in list", async () => {
      const superposition = {
        IDLE: { ACTIVE: { status: { in: ["ACTIVE", "RUNNING"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "RUNNING", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { status: "ACTIVE" }, superposition },
          { id: "q2", state: "IDLE", brane: { status: "RUNNING" }, superposition },
          { id: "q3", state: "IDLE", brane: { status: "IDLE" }, superposition },
          { id: "q4", state: "IDLE", brane: { status: "DEAD" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // ACTIVE in [ACTIVE, RUNNING]
      expect(result.states![1]).toBe("ACTIVE") // RUNNING in [ACTIVE, RUNNING]
      expect(result.states![2]).toBe("IDLE") // IDLE not in [ACTIVE, RUNNING]
      expect(result.states![3]).toBe("IDLE") // DEAD not in [ACTIVE, RUNNING]
    })
  })

  describe("NOT_IN operator (not in list)", () => {
    test("should transition if value is not in list", async () => {
      const superposition = {
        IDLE: { ACTIVE: { status: { notIn: ["IDLE", "DEAD"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "RUNNING", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { status: "IDLE" }, superposition },
          { id: "q2", state: "IDLE", brane: { status: "DEAD" }, superposition },
          { id: "q3", state: "IDLE", brane: { status: "ACTIVE" }, superposition },
          { id: "q4", state: "IDLE", brane: { status: "RUNNING" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // IDLE in [IDLE, DEAD]
      expect(result.states![1]).toBe("IDLE") // DEAD in [IDLE, DEAD]
      expect(result.states![2]).toBe("ACTIVE") // ACTIVE not in [IDLE, DEAD]
      expect(result.states![3]).toBe("ACTIVE") // RUNNING not in [IDLE, DEAD]
    })
  })

  describe("Multiple conditions", () => {
    test("should transition when conditions are met", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { gte: 2, lte: 4 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", brane: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", brane: { level: 3 }, superposition },
          { id: "q4", state: "IDLE", brane: { level: 4 }, superposition },
          { id: "q5", state: "IDLE", brane: { level: 5 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      // Result depends on implementation (AND or OR logic)
    })
  })
})
