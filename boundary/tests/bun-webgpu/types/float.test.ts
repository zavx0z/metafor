import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../../fixture/bunWebGPU"
import { Boundary } from "../../../src/index"

describe("Boundary - FLOAT type (number) with bun-webgpu", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  describe("EQ operator (equals)", () => {
    test("should transition when value equals specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 42 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 42 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 41 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 43 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("should work with negative numbers", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { eq: -10 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: -10 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 10 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("should work with fractional numbers", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 3.14 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 3.14 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 3.15 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("should work with zero", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 0 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 0 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 0.001 }, superposition },
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
        IDLE: { ACTIVE: { value: { neq: 42 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 42 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 41 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 43 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })

    test("should work with alias 'ne'", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { ne: 0 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 0 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 1 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
    })

    test("should work with alias 'notEq'", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notEq: 100 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 99 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
    })
  })

  describe("GT operator (greater than)", () => {
    test("should transition when value is greater than specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { gt: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 49 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("should work with negative numbers", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { gt: -10 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: -5 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: -10 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: -15 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("LT operator (less than)", () => {
    test("should transition when value is less than specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { lt: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("should work with negative numbers", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { lt: -5 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: -10 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: -5 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 0 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("GTE operator (greater than or equal)", () => {
    test("should transition when value is greater than or equal to specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { gte: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 49 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("LTE operator (less than or equal)", () => {
    test("should transition when value is less than or equal to specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { lte: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("IN operator (in list)", () => {
    test("should transition if value is in list", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { in: [10, 20, 30] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 10 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 20 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 30 }, superposition },
          { id: "q4", state: "IDLE", fields: { value: 15 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
      expect(states[3]).toBe("IDLE")
    })

    test("should work with empty list", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { in: [] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [{ id: "q1", state: "IDLE", fields: { value: 10 }, superposition }],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
    })
  })

  describe("NOT_IN operator (not in list)", () => {
    test("should transition if value is not in list", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notIn: [10, 20, 30] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 10 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 15 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 25 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Compound conditions (between)", () => {
    test("should transition if value is in range", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { between: [10, 20] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 9 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 10 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 15 }, superposition },
          { id: "q4", state: "IDLE", fields: { value: 20 }, superposition },
          { id: "q5", state: "IDLE", fields: { value: 21 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
      expect(states[3]).toBe("ACTIVE")
      expect(states[4]).toBe("IDLE")
    })
  })

  describe("Negative conditions (notGt, notGte, notLt, notLte)", () => {
    test("notGt should be equivalent to lte", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notGt: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })

    test("notGte should be equivalent to lt", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notGte: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("notLt should be equivalent to gte", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notLt: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })

    test("notLte should be equivalent to gt", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { notLte: 50 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 51 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Multiple conditions", () => {
    test("should transition when all conditions for one field are met (AND logic)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { value: { gte: 10, lte: 20 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { value: 9 }, superposition },
          { id: "q2", state: "IDLE", fields: { value: 15 }, superposition },
          { id: "q3", state: "IDLE", fields: { value: 21 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })
})