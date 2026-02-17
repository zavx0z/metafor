import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../fixture/bunWebGPU"
import { Boundary } from "../../src/index"

describe("Boundary - Tests with bun-webgpu (native API)", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  /** Common superposition for hp/mana/isAlive tests */
  const defaultSuperposition = {
    IDLE: {
      PATROL: { hp: { gt: 50 } },
      DEAD: { hp: { lte: 0 } },
    },
    PATROL: {
      IDLE: { mana: { lt: 10 } },
      COMBAT: { isAlive: true },
    },
    COMBAT: {
      DEAD: { hp: { lte: 0 } },
    },
    DEAD: null,
  }

  describe("Basic state transitions", () => {
    test("should transition from IDLE to DEAD when hp <= 0", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      await boundary.init({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 100, mana: 100, isAlive: true }, superposition: defaultSuperposition },
          { id: "q2", state: "IDLE", fields: { hp: 0, mana: 50, isAlive: false }, superposition: defaultSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("PATROL")
      expect(states[1]).toBe("DEAD")
    })

    test("should transition from IDLE to PATROL when hp > 50", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 100 }, superposition },
          { id: "q2", state: "IDLE", fields: { hp: 50 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("PATROL")
      expect(states[1]).toBe("IDLE")
    })

    test("should transition from IDLE to PATROL when hp >= 50", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { PATROL: { hp: { gte: 50 } } },
        PATROL: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 50 }, superposition },
          { id: "q2", state: "IDLE", fields: { hp: 49 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("PATROL")
      expect(states[1]).toBe("IDLE")
    })

    test("should transition from IDLE to PATROL when hp < 50", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { PATROL: { hp: { lt: 50 } } },
        PATROL: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 49 }, superposition },
          { id: "q2", state: "IDLE", fields: { hp: 50 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("PATROL")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Boolean conditions", () => {
    test("should transition when boolean component = true", async () => {
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

    test("should transition when boolean component = false", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        ACTIVE: { DEAD: { isAlive: false } },
        DEAD: null,
      }

      await boundary.init({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "ACTIVE", fields: { isAlive: false }, superposition },
          { id: "q2", state: "ACTIVE", fields: { isAlive: true }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
      expect(states[1]).toBe("ACTIVE")
    })
  })

  describe("Multiple conditions", () => {
    test("should transition when both conditions are met", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: {
          COMBAT: {
            hp: { gt: 50 },
            mana: { gt: 20 },
          },
        },
        COMBAT: null,
      }

      await boundary.init({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 100, mana: 50 }, superposition },
          { id: "q2", state: "IDLE", fields: { hp: 100, mana: 10 }, superposition },
          { id: "q3", state: "IDLE", fields: { hp: 30, mana: 50 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("COMBAT")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Brane updates", () => {
    test("should transition after brane update", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [{ id: "q1", state: "IDLE", fields: { hp: 100 }, superposition }],
      })

      boundary.updateBraneField(0, "hp", 0)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
    })

    test("should not transition after brane update if condition not met", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [{ id: "q1", state: "IDLE", fields: { hp: 100 }, superposition }],
      })

      boundary.updateBraneField(0, "hp", 50)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
    })
  })

  describe("Multi-step simulation", () => {
    test("should pass through multiple states", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: { COMBAT: { mana: { lt: 10 } } },
        COMBAT: null,
      }

      await boundary.init({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [{ id: "q1", state: "IDLE", fields: { hp: 100, mana: 5 }, superposition }],
      })

      boundary.step()
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("COMBAT")
    })
  })

  describe("Edge cases", () => {
    test("should handle multiple fields with same initial state", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { hp: { gt: 0 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 100 }, superposition },
          { id: "q2", state: "IDLE", fields: { hp: 200 }, superposition },
          { id: "q3", state: "IDLE", fields: { hp: 0 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })

    test("should handle fields with different initial states", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: { IDLE: { hp: { lte: 50 } } },
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 100 }, superposition },
          { id: "q2", state: "ACTIVE", fields: { hp: 30 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Fields with different superposition", () => {
    test("each field has its own superposition with different states", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const warriorSuperposition = {
        IDLE: { COMBAT: { hp: { gt: 80 } } },
        COMBAT: null,
      }

      const mageSuperposition = {
        IDLE: { MEDITATION: { mana: { lt: 20 } } },
        MEDITATION: null,
      }

      const scoutSuperposition = {
        IDLE: { SCOUT: { hp: { gt: 30 } } },
        SCOUT: null,
      }

      await boundary.init({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [
          { id: "warrior", state: "IDLE", fields: { hp: 90, mana: 50 }, superposition: warriorSuperposition },
          { id: "mage", state: "IDLE", fields: { hp: 50, mana: 10 }, superposition: mageSuperposition },
          { id: "scout", state: "IDLE", fields: { hp: 60, mana: 30 }, superposition: scoutSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("COMBAT")
      expect(states[1]).toBe("MEDITATION")
      expect(states[2]).toBe("SCOUT")
    })

    test("fields with same states but different transition conditions", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const lowThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 30 } } },
        ACTIVE: null,
      }

      const highThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 70 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 50 }, superposition: lowThresholdSuperposition },
          { id: "q2", state: "IDLE", fields: { hp: 50 }, superposition: highThresholdSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("fields with completely different state machines", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const aggressiveSuperposition = {
        IDLE: { ATTACK: { hp: { gt: 50 } } },
        ATTACK: { VICTORY: { hp: { gt: 90 } } },
        VICTORY: null,
      }

      const defensiveSuperposition = {
        IDLE: { DEFEND: { hp: { lte: 50 } } },
        DEFEND: { FORTIFY: { hp: { lte: 20 } } },
        FORTIFY: null,
      }

      await boundary.init({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "aggressive", state: "IDLE", fields: { hp: 95 }, superposition: aggressiveSuperposition },
          { id: "defensive", state: "IDLE", fields: { hp: 15 }, superposition: defensiveSuperposition },
        ],
      })

      boundary.step()
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("VICTORY")
      expect(states[1]).toBe("FORTIFY")
    })

    test("fields with different condition types in superposition", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const numericSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      const booleanSuperposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }

      const multiConditionSuperposition = {
        IDLE: {
          ACTIVE: {
            hp: { gt: 30 },
            mana: { gt: 20 },
          },
        },
        ACTIVE: null,
      }

      await boundary.init({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        branes: [
          { id: "q1", state: "IDLE", fields: { hp: 60, mana: 0, isAlive: false }, superposition: numericSuperposition },
          { id: "q2", state: "IDLE", fields: { hp: 0, mana: 0, isAlive: true }, superposition: booleanSuperposition },
          { id: "q3", state: "IDLE", fields: { hp: 40, mana: 30, isAlive: false }, superposition: multiConditionSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })
})