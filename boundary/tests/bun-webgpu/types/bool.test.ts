import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../../fixture/bunWebGPU"
import { Boundary } from "../../../src/index"

describe("Boundary - BOOL type (boolean) with bun-webgpu", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  describe("Direct value true", () => {
    test("should transition when value is true", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", fields: { isAlive: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Direct value false", () => {
    test("should transition when value is false", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { DEAD: { isAlive: false } },
        DEAD: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", fields: { isAlive: true }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("EQ operator (equals)", () => {
    test("should transition when value equals true", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { isAlive: { eq: true } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", fields: { isAlive: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("should transition when value equals false", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { DEAD: { isAlive: { eq: false } } },
        DEAD: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", fields: { isAlive: true }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("NEQ operator (not equals)", () => {
    test("should transition when value does not equal true", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { DEAD: { isAlive: { neq: true } } },
        DEAD: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", fields: { isAlive: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("DEAD")
    })

    test("should transition when value does not equal false", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { isAlive: { neq: false } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", fields: { isAlive: true }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
    })
  })

  describe("Multiple boolean conditions", () => {
    test("should transition when all conditions are met (AND)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { isAlive: true, hasMana: true } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" }, hasMana: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { isAlive: true, hasMana: true }, superposition },
          { id: "q2", state: "IDLE", fields: { isAlive: true, hasMana: false }, superposition },
          { id: "q3", state: "IDLE", fields: { isAlive: false, hasMana: true }, superposition },
          { id: "q4", state: "IDLE", fields: { isAlive: false, hasMana: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
      expect(states[3]).toBe("IDLE")
    })

    test("should transition with different combinations of boolean values", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { isAlive: true, isStunned: false } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" }, isStunned: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { isAlive: true, isStunned: false }, superposition },
          { id: "q2", state: "IDLE", fields: { isAlive: true, isStunned: true }, superposition },
          { id: "q3", state: "IDLE", fields: { isAlive: false, isStunned: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Boolean value updates", () => {
    test("should transition after updating value to true", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { isReady: true } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { isReady: { type: "boolean" } },
        branes: [{ id: "q1", state: "IDLE", fields: { isReady: false }, superposition }],
      })

      boundary.updateBraneField(0, "isReady", true)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })

    test("should transition after updating value to false", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { DEAD: { isAlive: false } },
        DEAD: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" } },
        branes: [{ id: "q1", state: "IDLE", fields: { isAlive: true }, superposition }],
      })

      boundary.updateBraneField(0, "isAlive", false)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
    })
  })

  describe("Mixed conditions (boolean + number)", () => {
    test("should transition when both conditions of different types are met", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { COMBAT: { isAlive: true, hp: { gt: 50 } } },
        COMBAT: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" }, hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { isAlive: true, hp: 100 }, superposition },
          { id: "q2", state: "IDLE", fields: { isAlive: true, hp: 30 }, superposition },
          { id: "q3", state: "IDLE", fields: { isAlive: false, hp: 100 }, superposition },
          { id: "q4", state: "IDLE", fields: { isAlive: false, hp: 30 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("COMBAT")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
      expect(states[3]).toBe("IDLE")
    })
  })
})