import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../src/index"

describe("Boundary — Тесты с bun-webgpu (нативный API)", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  /** Общая суперпозиция для тестов hp/mana/isAlive */
  const defaultSuperposition = {
    IDLE: {
      PATROL: { 0: { gt: 50 } },
      DEAD: { 0: { lte: 0 } },
    },
    PATROL: {
      IDLE: { 1: { lt: 10 } },
      COMBAT: { 2: true },
    },
    COMBAT: {
      DEAD: { 0: { lte: 0 } },
    },
    DEAD: null,
  }

  describe("Базовые переходы состояний", () => {
    test("должен перейти из IDLE в DEAD при hp <= 0", async () => {
      const boundary = new Boundary()

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
          [2, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: "IDLE", params: [[0, 100], [1, 100], [2, true]], superposition: defaultSuperposition },
          { state: "IDLE", params: [[0, 0], [1, 50], [2, false]], superposition: defaultSuperposition },
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
        IDLE: { PATROL: { 0: { gt: 50 } } },
        PATROL: null,
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: "IDLE", params: [[0, 100]], superposition },
          { state: "IDLE", params: [[0, 50]], superposition },
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
        IDLE: { PATROL: { 0: { gte: 50 } } },
        PATROL: null,
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: "IDLE", params: [[0, 50]], superposition },
          { state: "IDLE", params: [[0, 49]], superposition },
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
        IDLE: { PATROL: { 0: { lt: 50 } } },
        PATROL: null,
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: "IDLE", params: [[0, 49]], superposition },
          { state: "IDLE", params: [[0, 50]], superposition },
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
        IDLE: { ACTIVE: { 0: true } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [
          { state: "IDLE", params: [[0, true]], superposition },
          { state: "IDLE", params: [[0, false]], superposition },
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
        ACTIVE: { DEAD: { 0: false } },
        DEAD: null,
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [
          { state: "ACTIVE", params: [[0, false]], superposition },
          { state: "ACTIVE", params: [[0, true]], superposition },
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
            0: { gt: 50 },
            1: { gt: 20 },
          },
        },
        COMBAT: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { state: "IDLE", params: [[0, 100], [1, 50]], superposition },
          { state: "IDLE", params: [[0, 100], [1, 10]], superposition },
          { state: "IDLE", params: [[0, 30], [1, 50]], superposition },
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
        IDLE: { DEAD: { 0: { lte: 0 } } },
        DEAD: null,
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [{ state: "IDLE", params: [[0, 100]], superposition }],
      })

      boundary.updateBraneField(0, 0, 0)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
    })

    test("не должен переходить после обновления браны при невыполнении условия", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { PATROL: { 0: { gt: 50 } } },
        PATROL: null,
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [{ state: "IDLE", params: [[0, 100]], superposition }],
      })

      boundary.updateBraneField(0, 0, 50)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
    })
  })

  describe("Многошаговая симуляция", () => {
    test("должен пройти через несколько состояний", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { PATROL: { 0: { gt: 50 } } },
        PATROL: { COMBAT: { 1: { lt: 10 } } },
        COMBAT: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [{ state: "IDLE", params: [[0, 100], [1, 5]], superposition }],
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
        IDLE: { ACTIVE: { 0: { gt: 0 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: "IDLE", params: [[0, 100]], superposition },
          { state: "IDLE", params: [[0, 200]], superposition },
          { state: "IDLE", params: [[0, 0]], superposition },
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
        IDLE: { ACTIVE: { 0: { gt: 50 } } },
        ACTIVE: { IDLE: { 0: { lte: 50 } } },
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: "IDLE", params: [[0, 100]], superposition },
          { state: "ACTIVE", params: [[0, 30]], superposition },
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
        IDLE: { COMBAT: { 0: { gt: 80 } } },
        COMBAT: null,
      }

      const mageSuperposition = {
        IDLE: { MEDITATION: { 1: { lt: 20 } } },
        MEDITATION: null,
      }

      const scoutSuperposition = {
        IDLE: { SCOUT: { 0: { gt: 30 } } },
        SCOUT: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { state: "IDLE", params: [[0, 90], [1, 50]], superposition: warriorSuperposition },
          { state: "IDLE", params: [[0, 50], [1, 10]], superposition: mageSuperposition },
          { state: "IDLE", params: [[0, 60], [1, 30]], superposition: scoutSuperposition },
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
        IDLE: { ACTIVE: { 0: { gt: 30 } } },
        ACTIVE: null,
      }

      const highThresholdSuperposition = {
        IDLE: { ACTIVE: { 0: { gt: 70 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: "IDLE", params: [[0, 50]], superposition: lowThresholdSuperposition },
          { state: "IDLE", params: [[0, 50]], superposition: highThresholdSuperposition },
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
        IDLE: { ATTACK: { 0: { gt: 50 } } },
        ATTACK: { VICTORY: { 0: { gt: 90 } } },
        VICTORY: null,
      }

      const defensiveSuperposition = {
        IDLE: { DEFEND: { 0: { lte: 50 } } },
        DEFEND: { FORTIFY: { 0: { lte: 20 } } },
        FORTIFY: null,
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: "IDLE", params: [[0, 95]], superposition: aggressiveSuperposition },
          { state: "IDLE", params: [[0, 15]], superposition: defensiveSuperposition },
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
        IDLE: { ACTIVE: { 0: { gt: 50 } } },
        ACTIVE: null,
      }

      const booleanSuperposition = {
        IDLE: { ACTIVE: { 2: true } },
        ACTIVE: null,
      }

      const multiConditionSuperposition = {
        IDLE: {
          ACTIVE: {
            0: { gt: 30 },
            1: { gt: 20 },
          },
        },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
          [2, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: "IDLE", params: [[0, 60], [1, 0], [2, false]], superposition: numericSuperposition },
          { state: "IDLE", params: [[0, 0], [1, 0], [2, true]], superposition: booleanSuperposition },
          { state: "IDLE", params: [[0, 40], [1, 30], [2, false]], superposition: multiConditionSuperposition },
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