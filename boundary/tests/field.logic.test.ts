import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../src/index"
import type { NumericSuperposition } from "../src/index.t"

describe("Boundary — Тесты с bun-webgpu (нативный API)", () => {
  let boundary: Boundary

  beforeAll(async () => {
    GPU._device = await setupDevice()
    boundary = new Boundary()
  })

  afterEach(() => {
    boundary.clear()
  })

  /** Общая суперпозиция для тестов hp/mana/isAlive */
  const defaultStates = ["IDLE", "PATROL", "COMBAT", "DEAD"]

  const defaultSuperposition: NumericSuperposition = {
    transitions: [
      [  // Из IDLE (0)
        { to: 1, conditions: { 0: { gt: 50 } } },   // → PATROL если hp > 50
        { to: 3, conditions: { 0: { lte: 0 } } },   // → DEAD если hp <= 0
      ],
      [  // Из PATROL (1)
        { to: 0, conditions: { 1: { lt: 10 } } },   // → IDLE если mana < 10
        { to: 2, conditions: { 2: true } },         // → COMBAT если isAlive === true
      ],
      [  // Из COMBAT (2)
        { to: 3, conditions: { 0: { lte: 0 } } },   // → DEAD если hp <= 0
      ],
      [null],  // DEAD (3) — терминальное
    ],
  }

  describe("Базовые переходы состояний", () => {
    test("должен перейти из IDLE в DEAD при hp <= 0", async () => {
      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
          [2, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: 0, states: defaultStates, params: [[0, 100], [1, 100], [2, true]], superposition: defaultSuperposition },
          { state: 0, states: defaultStates, params: [[0, 0], [1, 50], [2, false]], superposition: defaultSuperposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("PATROL")  // hp=100 > 50
      expect(states[1]).toBe("DEAD")    // hp=0 <= 0
    })

    test("должен перейти из IDLE в PATROL при hp > 50", async () => {
      const states = ["IDLE", "PATROL"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],  // IDLE → PATROL если hp > 50
          [null],                                       // PATROL — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 100]], superposition },
          { state: 0, states, params: [[0, 50]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("PATROL")  // hp=100 > 50
      expect(resultStates[1]).toBe("IDLE")    // hp=50 не > 50
    })

    test("должен перейти из IDLE в PATROL при hp >= 50", async () => {
      const states = ["IDLE", "PATROL"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gte: 50 } } }],  // IDLE → PATROL если hp >= 50
          [null],                                        // PATROL — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 50]], superposition },
          { state: 0, states, params: [[0, 49]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("PATROL")  // hp=50 >= 50
      expect(resultStates[1]).toBe("IDLE")    // hp=49 не >= 50
    })

    test("должен перейти из IDLE в PATROL при hp < 50", async () => {
      const states = ["IDLE", "PATROL"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lt: 50 } } }],  // IDLE → PATROL если hp < 50
          [null],                                       // PATROL — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 49]], superposition },
          { state: 0, states, params: [[0, 50]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("PATROL")  // hp=49 < 50
      expect(resultStates[1]).toBe("IDLE")    // hp=50 не < 50
    })
  })

  describe("Логические условия", () => {
    test("должен перейти при логическом компоненте = true", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: true } }],  // IDLE → ACTIVE если true
          [null],                                // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [
          { state: 0, states, params: [[0, true]], superposition },
          { state: 0, states, params: [[0, false]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("IDLE")
    })

    test("должен перейти при логическом компоненте = false", async () => {
      const states = ["ACTIVE", "DEAD"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: false } }],  // ACTIVE → DEAD если false
          [null],                                  // DEAD — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.BOOL }]],
        branes: [
          { state: 0, states, params: [[0, false]], superposition },
          { state: 0, states, params: [[0, true]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("DEAD")
      expect(resultStates[1]).toBe("ACTIVE")
    })
  })

  describe("Множественные условия", () => {
    test("должен перейти при выполнении обоих условий", async () => {
      const states = ["IDLE", "COMBAT"]
      const superposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: { gt: 50 },   // hp > 50
                1: { gt: 20 },   // mana > 20
              },
            },
          ],
          [null],  // COMBAT — терминальное
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { state: 0, states, params: [[0, 100], [1, 50]], superposition },   // hp=100>50, mana=50>20 → COMBAT
          { state: 0, states, params: [[0, 100], [1, 10]], superposition },   // hp=100>50, mana=10 не >20 → IDLE
          { state: 0, states, params: [[0, 30], [1, 50]], superposition },    // hp=30 не >50, mana=50>20 → IDLE
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("COMBAT")
      expect(resultStates[1]).toBe("IDLE")
      expect(resultStates[2]).toBe("IDLE")
    })
  })

  describe("Обновление браны", () => {
    test("должен перейти после обновления браны", async () => {
      const states = ["IDLE", "DEAD"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lte: 0 } } }],  // IDLE → DEAD если hp <= 0
          [null],                                       // DEAD — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [{ state: 0, states, params: [[0, 100]], superposition }],
      })

      boundary.updateBraneField(0, 0, 0)  // hp = 0
      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("DEAD")
    })

    test("не должен переходить после обновления браны при невыполнении условия", async () => {
      const states = ["IDLE", "PATROL"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],  // IDLE → PATROL если hp > 50
          [null],                                       // PATROL — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [{ state: 0, states, params: [[0, 100]], superposition }],
      })

      boundary.updateBraneField(0, 0, 50)  // hp = 50 (не > 50)
      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("IDLE")
    })
  })

  describe("Многошаговая симуляция", () => {
    test("должен пройти через несколько состояний", async () => {
      const states = ["IDLE", "PATROL", "COMBAT"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],   // IDLE → PATROL если hp > 50
          [{ to: 2, conditions: { 1: { lt: 10 } } }],   // PATROL → COMBAT если mana < 10
          [null],                                        // COMBAT — терминальное
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [{ state: 0, states, params: [[0, 100], [1, 5]], superposition }],
      })

      boundary.step()  // IDLE → PATROL (hp=100>50)
      boundary.step()  // PATROL → COMBAT (mana=5<10)
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("COMBAT")
    })
  })

  describe("Граничные случаи", () => {
    test("должен обрабатывать несколько полей с одинаковым начальным состоянием", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 0 } } }],  // IDLE → ACTIVE если value > 0
          [null],                                     // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 100]], superposition },
          { state: 0, states, params: [[0, 200]], superposition },
          { state: 0, states, params: [[0, 0]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")
      expect(resultStates[1]).toBe("ACTIVE")
      expect(resultStates[2]).toBe("IDLE")
    })

    test("должен обрабатывать поля с разными начальными состояниями", async () => {
      const states = ["IDLE", "ACTIVE"]
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],   // IDLE → ACTIVE если hp > 50
          [{ to: 0, conditions: { 0: { lte: 50 } } }],  // ACTIVE → IDLE если hp <= 50
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 100]], superposition },   // IDLE, hp=100
          { state: 1, states, params: [[0, 30]], superposition },    // ACTIVE, hp=30
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")  // hp=100>50 → ACTIVE
      expect(resultStates[1]).toBe("IDLE")    // hp=30<=50 → IDLE
    })
  })

  describe("Поля с разными суперпозициями", () => {
    test("каждое поле имеет свою суперпозицию с разными состояниями", async () => {
      const warriorStates = ["IDLE", "COMBAT"]
      const warriorSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 80 } } }],  // IDLE → COMBAT если hp > 80
          [null],                                       // COMBAT — терминальное
        ],
      }

      const mageStates = ["IDLE", "MEDITATION"]
      const mageSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 1: { lt: 20 } } }],  // IDLE → MEDITATION если mana < 20
          [null],                                       // MEDITATION — терминальное
        ],
      }

      const scoutStates = ["IDLE", "SCOUT"]
      const scoutSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 30 } } }],  // IDLE → SCOUT если hp > 30
          [null],                                       // SCOUT — терминальное
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { state: 0, states: warriorStates, params: [[0, 90], [1, 50]], superposition: warriorSuperposition },
          { state: 0, states: mageStates, params: [[0, 50], [1, 10]], superposition: mageSuperposition },
          { state: 0, states: scoutStates, params: [[0, 60], [1, 30]], superposition: scoutSuperposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("COMBAT")     // hp=90>80
      expect(resultStates[1]).toBe("MEDITATION") // mana=10<20
      expect(resultStates[2]).toBe("SCOUT")      // hp=60>30
    })

    test("поля с одинаковыми состояниями, но разными условиями перехода", async () => {
      const states = ["IDLE", "ACTIVE"]

      const lowThresholdSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 30 } } }],  // IDLE → ACTIVE если hp > 30
          [null],                                       // ACTIVE — терминальное
        ],
      }

      const highThresholdSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 70 } } }],  // IDLE → ACTIVE если hp > 70
          [null],                                       // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 50]], superposition: lowThresholdSuperposition },
          { state: 0, states, params: [[0, 50]], superposition: highThresholdSuperposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")  // hp=50>30
      expect(resultStates[1]).toBe("IDLE")    // hp=50 не >70
    })

    test("поля с полностью разными конечными автоматами", async () => {
      const aggressiveStates = ["IDLE", "ATTACK", "VICTORY"]
      const aggressiveSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],   // IDLE → ATTACK если hp > 50
          [{ to: 2, conditions: { 0: { gt: 90 } } }],   // ATTACK → VICTORY если hp > 90
          [null],                                        // VICTORY — терминальное
        ],
      }

      const defensiveStates = ["IDLE", "DEFEND", "FORTIFY"]
      const defensiveSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { lte: 50 } } }],  // IDLE → DEFEND если hp <= 50
          [{ to: 2, conditions: { 0: { lte: 20 } } }],  // DEFEND → FORTIFY если hp <= 20
          [null],                                        // FORTIFY — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states: aggressiveStates, params: [[0, 95]], superposition: aggressiveSuperposition },
          { state: 0, states: defensiveStates, params: [[0, 15]], superposition: defensiveSuperposition },
        ],
      })

      boundary.step()  // IDLE → ATTACK (hp=95>50), IDLE → DEFEND (hp=15<=50)
      boundary.step()  // ATTACK → VICTORY (hp=95>90), DEFEND → FORTIFY (hp=15<=20)
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("VICTORY")
      expect(resultStates[1]).toBe("FORTIFY")
    })

    test("поля с разными типами условий в суперпозиции", async () => {
      const numericStates = ["IDLE", "ACTIVE"]
      const numericSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],  // IDLE → ACTIVE если hp > 50
          [null],                                       // ACTIVE — терминальное
        ],
      }

      const booleanStates = ["IDLE", "ACTIVE"]
      const booleanSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 2: true } }],  // IDLE → ACTIVE если isAlive === true
          [null],                                // ACTIVE — терминальное
        ],
      }

      const multiConditionStates = ["IDLE", "ACTIVE"]
      const multiConditionSuperposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: { gt: 30 },   // hp > 30
                1: { gt: 20 },   // mana > 20
              },
            },
          ],
          [null],  // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
          [2, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: 0, states: numericStates, params: [[0, 60], [1, 0], [2, false]], superposition: numericSuperposition },
          { state: 0, states: booleanStates, params: [[0, 0], [1, 0], [2, true]], superposition: booleanSuperposition },
          { state: 0, states: multiConditionStates, params: [[0, 40], [1, 30], [2, false]], superposition: multiConditionSuperposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("ACTIVE")  // hp=60>50
      expect(resultStates[1]).toBe("ACTIVE")  // isAlive=true
      expect(resultStates[2]).toBe("ACTIVE")  // hp=40>30 И mana=30>20
    })
  })
})
