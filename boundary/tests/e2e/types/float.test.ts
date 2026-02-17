import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BrowserWebGPU } from "../../fixture/browserWebGPU"

describe("Boundary - FLOAT type (number)", () => {
  beforeAll(async () => await BrowserWebGPU.setup())
  afterAll(async () => await BrowserWebGPU.teardown(), 20000)
  const fixture = new BrowserWebGPU()

  describe("EQ operator (equals)", () => {
    test("should transition when value equals specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 42 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 42 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 41 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 43 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 42 == 42
      expect(result.states![1]).toBe("IDLE") // 41 != 42
      expect(result.states![2]).toBe("IDLE") // 43 != 42
    })

    test("should work with negative numbers", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { eq: -10 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: -10 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 10 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("IDLE")
    })

    test("should work with fractional numbers", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 3.14 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 3.14 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 3.15 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("IDLE")
    })

    test("should work with zero", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 0 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 0 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 0.001 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("IDLE")
    })
  })

  describe("NEQ operator (not equals)", () => {
    test("should transition when value not equals specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { neq: 42 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 42 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 41 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 43 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // 42 == 42
      expect(result.states![1]).toBe("ACTIVE") // 41 != 42
      expect(result.states![2]).toBe("ACTIVE") // 43 != 42
    })

    test("should work with alias 'ne'", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { ne: 0 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 0 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 1 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
      expect(result.states![1]).toBe("ACTIVE")
    })

    test("should work with alias 'notEq'", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notEq: 100 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 99 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
      expect(result.states![1]).toBe("ACTIVE")
    })
  })

  describe("GT operator (greater than)", () => {
    test("should transition when value greater than specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { gt: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 49 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 100 > 50
      expect(result.states![1]).toBe("IDLE") // 50 not > 50
      expect(result.states![2]).toBe("IDLE") // 49 not > 50
    })

    test("should work with negative numbers", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { gt: -10 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: -5 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: -10 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: -15 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // -5 > -10
      expect(result.states![1]).toBe("IDLE") // -10 not > -10
      expect(result.states![2]).toBe("IDLE") // -15 not > -10
    })
  })

  describe("LT operator (less than)", () => {
    test("should transition when value less than specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { lt: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 49 < 50
      expect(result.states![1]).toBe("IDLE") // 50 not < 50
      expect(result.states![2]).toBe("IDLE") // 51 not < 50
    })

    test("should work with negative numbers", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { lt: -5 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: -10 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: -5 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 0 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // -10 < -5
      expect(result.states![1]).toBe("IDLE") // -5 not < -5
      expect(result.states![2]).toBe("IDLE") // 0 not < -5
    })
  })

  describe("GTE operator (greater than or equal)", () => {
    test("should transition when value greater than or equal to specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { gte: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 49 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 100 >= 50
      expect(result.states![1]).toBe("ACTIVE") // 50 >= 50
      expect(result.states![2]).toBe("IDLE") // 49 not >= 50
    })
  })

  describe("LTE operator (less than or equal)", () => {
    test("should transition when value less than or equal to specified", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { lte: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 49 <= 50
      expect(result.states![1]).toBe("ACTIVE") // 50 <= 50
      expect(result.states![2]).toBe("IDLE") // 51 not <= 50
    })
  })

  describe("IN operator (in list)", () => {
    test("should transition if value is in list", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { in: [10, 20, 30] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 10 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 20 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 30 }, superposition },
          { id: "q4", state: "IDLE", brane: { value: 15 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 10 in [10, 20, 30]
      expect(result.states![1]).toBe("ACTIVE") // 20 in [10, 20, 30]
      expect(result.states![2]).toBe("ACTIVE") // 30 in [10, 20, 30]
      expect(result.states![3]).toBe("IDLE") // 15 not in [10, 20, 30]
    })

    test("should work with empty list", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { in: [] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [{ id: "q1", state: "IDLE", brane: { value: 10 }, superposition }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // Nothing is in empty list
    })
  })

  describe("NOT_IN operator (not in list)", () => {
    test("should transition if value is not in list", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notIn: [10, 20, 30] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 10 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 15 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 25 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // 10 in [10, 20, 30]
      expect(result.states![1]).toBe("ACTIVE") // 15 not in [10, 20, 30]
      expect(result.states![2]).toBe("ACTIVE") // 25 not in [10, 20, 30]
    })
  })

  describe("Compound conditions (between)", () => {
    test("should transition if value is in range", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { between: [10, 20] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 9 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 10 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 15 }, superposition },
          { id: "q4", state: "IDLE", brane: { value: 20 }, superposition },
          { id: "q5", state: "IDLE", brane: { value: 21 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      // between compiles to gte(10) AND lte(20)
      expect(result.states![0]).toBe("IDLE") // 9 < 10
      expect(result.states![1]).toBe("ACTIVE") // 10 >= 10 && 10 <= 20
      expect(result.states![2]).toBe("ACTIVE") // 15 >= 10 && 15 <= 20
      expect(result.states![3]).toBe("ACTIVE") // 20 >= 10 && 20 <= 20
      expect(result.states![4]).toBe("IDLE") // 21 > 20
    })
  })

  describe("Negative conditions (notGt, notGte, notLt, notLte)", () => {
    test("notGt should be equivalent to lte", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notGt: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // !(49 > 50) == true
      expect(result.states![1]).toBe("ACTIVE") // !(50 > 50) == true
      expect(result.states![2]).toBe("IDLE") // !(51 > 50) == false
    })

    test("notGte should be equivalent to lt", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notGte: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // !(49 >= 50) == true
      expect(result.states![1]).toBe("IDLE") // !(50 >= 50) == false
      expect(result.states![2]).toBe("IDLE") // !(51 >= 50) == false
    })

    test("notLt should be equivalent to gte", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notLt: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // !(49 < 50) == false
      expect(result.states![1]).toBe("ACTIVE") // !(50 < 50) == true
      expect(result.states![2]).toBe("ACTIVE") // !(51 < 50) == true
    })

    test("notLte should be equivalent to gt", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notLte: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // !(49 <= 50) == false
      expect(result.states![1]).toBe("IDLE") // !(50 <= 50) == false
      expect(result.states![2]).toBe("ACTIVE") // !(51 <= 50) == true
    })
  })

  describe("Multiple conditions", () => {
    test("should transition when all conditions for one field are met (AND logic)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { gte: 10, lte: 20 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", brane: { value: 9 }, superposition },
          { id: "q2", state: "IDLE", brane: { value: 15 }, superposition },
          { id: "q3", state: "IDLE", brane: { value: 21 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      // All conditions for one field are checked with AND logic
      expect(result.states![0]).toBe("IDLE") // 9 < 10 (fails gte)
      expect(result.states![1]).toBe("ACTIVE") // 15 >= 10 && 15 <= 20 (both conditions)
      expect(result.states![2]).toBe("IDLE") // 21 > 20 (fails lte)
    })
  })
})
