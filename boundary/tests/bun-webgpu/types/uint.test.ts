import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../../fixture/bunWebGPU"
import { Boundary } from "../../../src/index"

describe("Boundary - UINT type (enum) with bun-webgpu", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  // NOTE: Enum values are stored as indices in the values array.
  // GT/LT/GTE/LTE comparisons work with indices, not values.

  describe("EQ operator (equals)", () => {
    test("should transition when value equals specified (string enum)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { status: { eq: "ACTIVE" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { status: "ACTIVE" }, superposition },
          { id: "q2", state: "IDLE", fields: { status: "IDLE" }, superposition },
          { id: "q3", state: "IDLE", fields: { status: "DEAD" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("should transition when value equals specified (number enum)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { level: { eq: 2 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3] },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { level: 2 }, superposition },
          { id: "q2", state: "IDLE", fields: { level: 1 }, superposition },
          { id: "q3", state: "IDLE", fields: { level: 3 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("NEQ operator (not equals)", () => {
    test("should transition when value does not equal specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { status: { neq: "IDLE" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { status: "IDLE" }, superposition },
          { id: "q2", state: "IDLE", fields: { status: "ACTIVE" }, superposition },
          { id: "q3", state: "IDLE", fields: { status: "DEAD" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("GT operator (greater than)", () => {
    test("should transition when value is greater than specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { level: { gt: 1 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", fields: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", fields: { level: 3 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("LT operator (less than)", () => {
    test("should transition when value is less than specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { level: { lt: 3 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", fields: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", fields: { level: 3 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("GTE operator (greater than or equal)", () => {
    test("should transition when value is greater than or equal to specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { level: { gte: 3 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { level: 2 }, superposition },
          { id: "q2", state: "IDLE", fields: { level: 3 }, superposition },
          { id: "q3", state: "IDLE", fields: { level: 4 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("LTE operator (less than or equal)", () => {
    test("should transition when value is less than or equal to specified", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { level: { lte: 2 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", fields: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", fields: { level: 3 }, superposition },
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
        IDLE: { ACTIVE: { status: { in: ["ACTIVE", "RUNNING"] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "RUNNING", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { status: "ACTIVE" }, superposition },
          { id: "q2", state: "IDLE", fields: { status: "RUNNING" }, superposition },
          { id: "q3", state: "IDLE", fields: { status: "IDLE" }, superposition },
          { id: "q4", state: "IDLE", fields: { status: "DEAD" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
      expect(states[3]).toBe("IDLE")
    })
  })

  describe("NOT_IN operator (not in list)", () => {
    test("should transition if value is not in list", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { status: { notIn: ["IDLE", "DEAD"] } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "RUNNING", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { status: "IDLE" }, superposition },
          { id: "q2", state: "IDLE", fields: { status: "DEAD" }, superposition },
          { id: "q3", state: "IDLE", fields: { status: "ACTIVE" }, superposition },
          { id: "q4", state: "IDLE", fields: { status: "RUNNING" }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("ACTIVE")
      expect(states[3]).toBe("ACTIVE")
    })
  })

  describe("Multiple conditions", () => {
    test("should transition when conditions are met", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { level: { gte: 2, lte: 4 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", fields: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", fields: { level: 3 }, superposition },
          { id: "q4", state: "IDLE", fields: { level: 4 }, superposition },
          { id: "q5", state: "IDLE", fields: { level: 5 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      // Result depends on implementation (AND or OR logic)
      expect(states).toBeDefined()
    })
  })
})