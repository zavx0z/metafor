import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../src/index"
import type { NumericSuperposition } from "../src/index.t"

describe("Boundary — Логические стадии (bun-webgpu)", () => {
  let boundary: Boundary

  beforeAll(async () => {
    GPU._device = await setupDevice()
    boundary = new Boundary()
  })

  afterEach(() => {
    boundary.clear()
  })

  describe("Оператор IN (Списки)", () => {
    test("должен перейти, если значение в списке (int/enum)", async () => {
      const states = ["GROUND", "WALK", "FLY", "AIR"]
      const superposition: NumericSuperposition = {
        transitions: [
          [
            { to: 1, conditions: { 0: { in: [1, 3, 5] } } },  // GROUND → WALK если type in [1,3,5]
            { to: 2, conditions: { 0: { in: [2, 4, 6] } } },  // GROUND → FLY если type in [2,4,6]
          ],
          [null],  // WALK — терминальное
          [null],  // FLY — терминальное
          [null],  // AIR — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 1]], superposition },  // 1 in [1,3,5] → WALK
          { state: 0, states, params: [[0, 4]], superposition },  // 4 in [2,4,6] → FLY
          { state: 0, states, params: [[0, 0]], superposition },  // 0 не в списках → GROUND
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("WALK")
      expect(resultStates[1]).toBe("FLY")
      expect(resultStates[2]).toBe("GROUND")
    })

    test("должен перейти, если float-значение в списке", async () => {
      const states = ["NORMAL", "WARNING", "CRITICAL"]
      const superposition: NumericSuperposition = {
        transitions: [
          [
            { to: 1, conditions: { 0: { in: [36.6, 37.0] } } },  // NORMAL → WARNING
            { to: 2, conditions: { 0: { in: [38.0, 39.0, 40.0] } } },  // NORMAL → CRITICAL
          ],
          [null],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 36.6]], superposition },
          { state: 0, states, params: [[0, 37.0]], superposition },
          { state: 0, states, params: [[0, 40.0]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("WARNING")
      expect(resultStates[1]).toBe("WARNING")
      expect(resultStates[2]).toBe("CRITICAL")
    })
  })

  describe("Оператор NOT_IN (Исключение)", () => {
    test("должен перейти, если значение НЕ в списке", async () => {
      const states = ["LOBBY", "GAME", "SPECTATOR"]
      const superposition: NumericSuperposition = {
        transitions: [
          [
            { to: 1, conditions: { 0: { notIn: [0, 2] } } },  // LOBBY → GAME если players NOT IN [0,2]
          ],
          [null],
          [null],
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { state: 0, states, params: [[0, 1]], superposition },   // GAME (1 не в [0,2])
          { state: 0, states, params: [[0, 0]], superposition },   // LOBBY (0 в [0,2])
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("GAME")
      expect(resultStates[1]).toBe("LOBBY")
    })
  })

  describe("Комбинированные условия", () => {
    test("должен работать с комбинацией диапазонов и списков", async () => {
      const states = ["START", "READY", "BLOCKED"]
      const superposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: { gte: 100 },  // score >= 100
                1: { in: [5, 7, 10] },  // badge IN [5,7,10]
              },
            },
          ],
          [null],
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { state: 0, states, params: [[0, 150], [1, 5]], superposition },   // READY
          { state: 0, states, params: [[0, 150], [1, 1]], superposition },   // START (badge не в списке)
          { state: 0, states, params: [[0, 50], [1, 7]], superposition },    // START (score < 100)
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe("READY")
      expect(resultStates[1]).toBe("START")
      expect(resultStates[2]).toBe("START")
    })
  })
})
