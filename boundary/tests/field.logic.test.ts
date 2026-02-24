import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU } from "../src/index"

describe("Boundary — Тесты с bun-webgpu (нативный API)", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  /** Общая суперпозиция для тестов hp/mana/isAlive */
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

  describe("Базовые переходы состояний", () => {
    test("должен перейти из IDLE в DEAD при hp <= 0", async () => {
      const boundary = new Boundary()

      await boundary.write({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 100, mana: 100, isAlive: true }, superposition: defaultSuperposition },
          { id: "q2", state: "IDLE", params: { hp: 0, mana: 50, isAlive: false }, superposition: defaultSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("PATROL")
      expect(states[1]).toBe("DEAD")
    })

    test("должен перейти из IDLE в PATROL при hp > 50", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      }

      await boundary.write({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 100 }, superposition },
          { id: "q2", state: "IDLE", params: { hp: 50 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("PATROL")
      expect(states[1]).toBe("IDLE")
    })

    test("должен перейти из IDLE в PATROL при hp >= 50", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { PATROL: { hp: { gte: 50 } } },
        PATROL: null,
      }

      await boundary.write({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 50 }, superposition },
          { id: "q2", state: "IDLE", params: { hp: 49 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("PATROL")
      expect(states[1]).toBe("IDLE")
    })

    test("должен перейти из IDLE в PATROL при hp < 50", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { PATROL: { hp: { lt: 50 } } },
        PATROL: null,
      }

      await boundary.write({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { hp: 50 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("PATROL")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Логические условия", () => {
    test("должен перейти при логическом компоненте = true", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "IDLE", params: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", params: { isAlive: false }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("должен перейти при логическом компоненте = false", async () => {
      const boundary = new Boundary()

      const superposition = {
        ACTIVE: { DEAD: { isAlive: false } },
        DEAD: null,
      }

      await boundary.write({
        fields: { isAlive: { type: "boolean" } },
        branes: [
          { id: "q1", state: "ACTIVE", params: { isAlive: false }, superposition },
          { id: "q2", state: "ACTIVE", params: { isAlive: true }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
      expect(states[1]).toBe("ACTIVE")
    })
  })

  describe("Множественные условия", () => {
    test("должен перейти при выполнении обоих условий", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: {
          COMBAT: {
            hp: { gt: 50 },
            mana: { gt: 20 },
          },
        },
        COMBAT: null,
      }

      await boundary.write({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 100, mana: 50 }, superposition },
          { id: "q2", state: "IDLE", params: { hp: 100, mana: 10 }, superposition },
          { id: "q3", state: "IDLE", params: { hp: 30, mana: 50 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("COMBAT")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Обновление браны", () => {
    test("должен перейти после обновления браны", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      }

      await boundary.write({
        fields: { hp: { type: "number" } },
        branes: [{ id: "q1", state: "IDLE", params: { hp: 100 }, superposition }],
      })

      boundary.updateBraneField(0, "hp", 0)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
    })

    test("не должен переходить после обновления браны при невыполнении условия", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      }

      await boundary.write({
        fields: { hp: { type: "number" } },
        branes: [{ id: "q1", state: "IDLE", params: { hp: 100 }, superposition }],
      })

      boundary.updateBraneField(0, "hp", 50)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
    })
  })

  describe("Многошаговая симуляция", () => {
    test("должен пройти через несколько состояний", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: { COMBAT: { mana: { lt: 10 } } },
        COMBAT: null,
      }

      await boundary.write({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [{ id: "q1", state: "IDLE", params: { hp: 100, mana: 5 }, superposition }],
      })

      boundary.step()
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("COMBAT")
    })
  })

  describe("Граничные случаи", () => {
    test("должен обрабатывать несколько полей с одинаковым начальным состоянием", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { hp: { gt: 0 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 100 }, superposition },
          { id: "q2", state: "IDLE", params: { hp: 200 }, superposition },
          { id: "q3", state: "IDLE", params: { hp: 0 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен обрабатывать поля с разными начальными состояниями", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: { IDLE: { hp: { lte: 50 } } },
      }

      await boundary.write({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 100 }, superposition },
          { id: "q2", state: "ACTIVE", params: { hp: 30 }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Поля с разными суперпозициями", () => {
    test("каждое поле имеет свою суперпозицию с разными состояниями", async () => {
      const boundary = new Boundary()

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

      await boundary.write({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
        },
        branes: [
          { id: "warrior", state: "IDLE", params: { hp: 90, mana: 50 }, superposition: warriorSuperposition },
          { id: "mage", state: "IDLE", params: { hp: 50, mana: 10 }, superposition: mageSuperposition },
          { id: "scout", state: "IDLE", params: { hp: 60, mana: 30 }, superposition: scoutSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("COMBAT")
      expect(states[1]).toBe("MEDITATION")
      expect(states[2]).toBe("SCOUT")
    })

    test("поля с одинаковыми состояниями, но разными условиями перехода", async () => {
      const boundary = new Boundary()

      const lowThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 30 } } },
        ACTIVE: null,
      }

      const highThresholdSuperposition = {
        IDLE: { ACTIVE: { hp: { gt: 70 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 50 }, superposition: lowThresholdSuperposition },
          { id: "q2", state: "IDLE", params: { hp: 50 }, superposition: highThresholdSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("поля с полностью разными конечными автоматами", async () => {
      const boundary = new Boundary()

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

      await boundary.write({
        fields: { hp: { type: "number" } },
        branes: [
          { id: "aggressive", state: "IDLE", params: { hp: 95 }, superposition: aggressiveSuperposition },
          { id: "defensive", state: "IDLE", params: { hp: 15 }, superposition: defensiveSuperposition },
        ],
      })

      boundary.step()
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("VICTORY")
      expect(states[1]).toBe("FORTIFY")
    })

    test("поля с разными типами условий в суперпозиции", async () => {
      const boundary = new Boundary()

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

      await boundary.write({
        fields: {
          hp: { type: "number" },
          mana: { type: "number" },
          isAlive: { type: "boolean" },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { hp: 60, mana: 0, isAlive: false }, superposition: numericSuperposition },
          { id: "q2", state: "IDLE", params: { hp: 0, mana: 0, isAlive: true }, superposition: booleanSuperposition },
          { id: "q3", state: "IDLE", params: { hp: 40, mana: 30, isAlive: false }, superposition: multiConditionSuperposition },
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