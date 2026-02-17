import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../../fixture/bunWebGPU"
import { Boundary } from "../../../src/index"

describe("Boundary - ARRAY type with bun-webgpu", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  // NOTE: ARRAY type is stored as length + pointers to elements.
  // Supported element types: array<string>, array<number>

  describe("INCLUDE operator (contains element)", () => {
    test("should transition if array contains specified element (number)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { tags: { include: 5 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { tags: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { tags: [1, 5, 10] }, superposition },
          { id: "q2", state: "IDLE", fields: { tags: [1, 2, 3] }, superposition },
          { id: "q3", state: "IDLE", fields: { tags: [] }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("should transition if array contains specified element (string)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { tags: { include: "fire" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { tags: { type: "array<string>" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { tags: ["fire", "ice", "lightning"] }, superposition },
          { id: "q2", state: "IDLE", fields: { tags: ["ice", "lightning"] }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("NOT_INCLUDE operator (does not contain element)", () => {
    test("should transition if array does not contain specified element", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { tags: { notInclude: 99 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { tags: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { tags: [1, 2, 3] }, superposition },
          { id: "q2", state: "IDLE", fields: { tags: [99, 100] }, superposition },
          { id: "q3", state: "IDLE", fields: { tags: [] }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("LENGTH operator (array length)", () => {
    test("should transition when length equals specified value", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { length: 3 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { items: [1, 2, 3] }, superposition },
          { id: "q2", state: "IDLE", fields: { items: [1, 2] }, superposition },
          { id: "q3", state: "IDLE", fields: { items: [1, 2, 3, 4] }, superposition },
          { id: "q4", state: "IDLE", fields: { items: [] }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
      expect(states[3]).toBe("IDLE")
    })

    test("should support length comparison with operators", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { length: { gte: 2 } } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { items: [1] }, superposition },
          { id: "q2", state: "IDLE", fields: { items: [1, 2] }, superposition },
          { id: "q3", state: "IDLE", fields: { items: [1, 2, 3] }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("IS_EMPTY operator (empty array)", () => {
    test("should transition if array is empty", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { EMPTY: { items: { isEmpty: true } } },
        EMPTY: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { items: [] }, superposition },
          { id: "q2", state: "IDLE", fields: { items: [1] }, superposition },
          { id: "q3", state: "IDLE", fields: { items: [1, 2, 3] }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("EMPTY")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("should transition if array is not empty (isEmpty: false)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { isEmpty: false } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { items: [] }, superposition },
          { id: "q2", state: "IDLE", fields: { items: [1] }, superposition },
          { id: "q3", state: "IDLE", fields: { items: [1, 2, 3] }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Combined conditions with arrays", () => {
    test("should transition when multiple conditions are met", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: {
          ACTIVE: {
            items: { length: { gte: 2, lte: 5 } },
            tags: { include: 1 },
          },
        },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" }, tags: { type: "array<number>" } },
        branes: [
          {
            id: "q1",
            state: "IDLE",
            fields: { items: [1, 2, 3], tags: [1, 5] },
            superposition,
          },
          {
            id: "q2",
            state: "IDLE",
            fields: { items: [1], tags: [1, 5] },
            superposition,
          },
          {
            id: "q3",
            state: "IDLE",
            fields: { items: [1, 2, 3], tags: [2, 3] },
            superposition,
          },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Edge cases", () => {
    test("should correctly handle empty array", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { isEmpty: true } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [{ id: "q1", state: "IDLE", fields: { items: [] }, superposition }],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })

    test("should correctly handle array with one element", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { length: 1 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [{ id: "q1", state: "IDLE", fields: { items: [42] }, superposition }],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })

    test("should correctly handle large array", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { length: 100 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [
          {
            id: "q1",
            state: "IDLE",
            fields: { items: Array.from({ length: 100 }, (_, i) => i) },
            superposition,
          },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })
  })
})