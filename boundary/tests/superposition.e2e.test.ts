import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BoundaryTestFixture } from "./fixture"

/**
 * E2E tests for individual superpositions on real GPU.
 *
 * These tests verify full integration of compilation and execution
 * on GPU with different superposition for each field.
 *
 * ### Covered scenarios:
 * 1. Fields with different states in superposition
 * 2. Fields with different transition conditions
 * 3. Fields with different thresholds for the same transition
 * 4. Fields with completely different state machines
 * 5. Multi-step simulations with individual transitions
 */
describe("Boundary - E2E tests for individual superpositions", () => {
  beforeAll(async () => await BoundaryTestFixture.setup())
  afterAll(async () => await BoundaryTestFixture.teardown(), 20000)
  const fixture = new BoundaryTestFixture()

  describe("Fields with different states", () => {
    test("each field transitions to its target state", async () => {
      // Warrior: IDLE -> COMBAT when hp > 80
      const warriorSuperposition = {
        IDLE: { COMBAT: { hp: { gt: 80 } } },
        COMBAT: null,
      }

      // Mage: IDLE -> MEDITATE when mana < 20
      const mageSuperposition = {
        IDLE: { MEDITATE: { mana: { lt: 20 } } },
        MEDITATE: null,
      }

      // Scout: IDLE -> SCOUT when hp > 30
      const scoutSuperposition = {
        IDLE: { SCOUT: { hp: { gt: 30 } } },
        SCOUT: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [
          { id: "warrior", state: "IDLE", brane: { hp: 90, mana: 50 }, superposition: warriorSuperposition },
          { id: "mage", state: "IDLE", brane: { hp: 50, mana: 10 }, superposition: mageSuperposition },
          { id: "scout", state: "IDLE", brane: { hp: 60, mana: 30 }, superposition: scoutSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Warrior: hp=90 > 80 -> COMBAT
      expect(result.states![0]).toBe("COMBAT")
      // Mage: mana=10 < 20 -> MEDITATE
      expect(result.states![1]).toBe("MEDITATE")
      // Scout: hp=60 > 30 -> SCOUT
      expect(result.states![2]).toBe("SCOUT")
    })
  })

  describe("Fields with different transition conditions", () => {
    test("different thresholds for the same transition", async () => {
      // Field 0: IDLE -> ACTIVE when hp > 30 (low threshold)
      const lowThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 30 } } },
        ACTIVE: null,
      }

      // Field 1: IDLE -> ACTIVE when hp > 70 (high threshold)
      const highThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 70 } } },
        ACTIVE: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { hp: 50 }, superposition: lowThresholdSuperposition },
          { id: "q2", state: "IDLE", brane: { hp: 50 }, superposition: highThresholdSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Field 0: hp=50 > 30 -> ACTIVE
      expect(result.states![0]).toBe("ACTIVE")
      // Field 1: hp=50 not > 70 -> IDLE
      expect(result.states![1]).toBe("IDLE")
    })

    test("different comparison operators", async () => {
      // Field 0: transition when hp > 50
      const gtSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      // Field 1: transition when hp >= 50
      const gteSuperposition = {
        IDLE: { ACTIVE: { hp: { gte: 50 } } },
        ACTIVE: null,
      }

      // Field 2: transition when hp < 50
      const ltSuperposition = {
        IDLE: { ACTIVE: { hp: { lt: 50 } } },
        ACTIVE: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { hp: 50 }, superposition: gtSuperposition },
          { id: "q2", state: "IDLE", brane: { hp: 50 }, superposition: gteSuperposition },
          { id: "q3", state: "IDLE", brane: { hp: 50 }, superposition: ltSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Field 0: hp=50 not > 50 -> IDLE
      expect(result.states![0]).toBe("IDLE")
      // Field 1: hp=50 >= 50 -> ACTIVE
      expect(result.states![1]).toBe("ACTIVE")
      // Field 2: hp=50 not < 50 -> IDLE
      expect(result.states![2]).toBe("IDLE")
    })
  })

  describe("Fields with completely different state machines", () => {
    test("aggressive vs defensive unit", async () => {
      // Aggressive: IDLE -> ATTACK -> VICTORY
      const aggressiveSuperposition = {
        IDLE: { ATTACK: { hp: { gt: 50 } } },
        ATTACK: { VICTORY: { hp: { gt: 90 } } },
        VICTORY: null,
      }

      // Defensive: IDLE -> DEFEND -> FORTIFY
      const defensiveSuperposition = {
        IDLE: { DEFEND: { hp: { lte: 50 } } },
        DEFEND: { FORTIFY: { hp: { lte: 20 } } },
        FORTIFY: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
        },
        branes: [
          { id: "aggressive", state: "IDLE", brane: { hp: 95 }, superposition: aggressiveSuperposition },
          { id: "defensive", state: "IDLE", brane: { hp: 15 }, superposition: defensiveSuperposition },
        ],
        steps: 2,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Aggressive: IDLE -> ATTACK (hp=95>50) -> VICTORY (hp=95>90)
      expect(result.states![0]).toBe("VICTORY")
      // Defensive: IDLE -> DEFEND (hp=15<=50) -> FORTIFY (hp=15<=20)
      expect(result.states![1]).toBe("FORTIFY")
    })
  })

  describe("Different types of conditions", () => {
    test("numeric, boolean, and multiple conditions", async () => {
      // Field 0: numeric condition
      const numericSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      // Field 1: boolean condition
      const booleanSuperposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }

      // Field 2: multiple condition
      const multiConditionSuperposition = {
        IDLE: {
          ACTIVE: {
            hp: { gt: 30 },
            mana: { gt: 20 },
          },
        },
        ACTIVE: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { hp: 60, mana: 0, isAlive: false }, superposition: numericSuperposition },
          { id: "q2", state: "IDLE", brane: { hp: 0, mana: 0, isAlive: true }, superposition: booleanSuperposition },
          { id: "q3", state: "IDLE", brane: { hp: 40, mana: 30, isAlive: false }, superposition: multiConditionSuperposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Field 0: hp=60 > 50 -> ACTIVE
      expect(result.states![0]).toBe("ACTIVE")
      // Field 1: isAlive=true -> ACTIVE
      expect(result.states![1]).toBe("ACTIVE")
      // Field 2: hp=40>30 AND mana=30>20 -> ACTIVE
      expect(result.states![2]).toBe("ACTIVE")
    })
  })

  describe("Brane update with individual superposition", () => {
    test("different initial values with different thresholds", async () => {
      // Field 0: IDLE -> ACTIVE when hp > 50
      const superposition1 = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      // Field 1: IDLE -> ACTIVE when hp > 70
      const superposition2 = {
        IDLE: { ACTIVE: { hp: { gt: 70 } } },
        ACTIVE: null,
      }

      // Use different initial values to avoid entangled brane
      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
        },
        branes: [
          { id: "q1", state: "IDLE", brane: { hp: 60 }, superposition: superposition1 },
          { id: "q2", state: "IDLE", brane: { hp: 60 }, superposition: superposition2 },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Field 0: hp=60 > 50 -> ACTIVE
      expect(result.states![0]).toBe("ACTIVE")
      // Field 1: hp=60 not > 70 -> IDLE
      expect(result.states![1]).toBe("IDLE")
    })
  })

  describe("Multi-step simulation", () => {
    test("each field follows its own state path", async () => {
      // Unit 1: IDLE -> PHASE1 -> PHASE2 -> FINAL
      const unit1Superposition = {
        IDLE: { PHASE1: { hp: { gt: 80 } } },
        PHASE1: { PHASE2: { hp: { gt: 60 } } },
        PHASE2: { FINAL: { hp: { gt: 40 } } },
        FINAL: null,
      }

      // Unit 2: IDLE -> STAGE_A -> STAGE_B
      const unit2Superposition = {
        IDLE: { STAGE_A: { mana: { lt: 50 } } },
        STAGE_A: { STAGE_B: { mana: { lt: 20 } } },
        STAGE_B: null,
      }

      const result = await fixture.runSimulation({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [
          { id: "unit1", state: "IDLE", brane: { hp: 90, mana: 100 }, superposition: unit1Superposition },
          { id: "unit2", state: "IDLE", brane: { hp: 100, mana: 10 }, superposition: unit2Superposition },
        ],
        steps: 3,
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()

      // Unit 1: IDLE -> PHASE1 -> PHASE2 -> FINAL
      expect(result.states![0]).toBe("FINAL")
      // Unit 2: IDLE -> STAGE_A -> STAGE_B (stops at STAGE_B)
      expect(result.states![1]).toBe("STAGE_B")
    })
  })
})
