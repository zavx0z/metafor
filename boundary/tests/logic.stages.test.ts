import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../src/index"
import { toNumericSuperposition } from "./numeric.helper"

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
      

      const superposition = toNumericSuperposition({
        GROUND: {
          AIR: { 0: { in: [3] } }, // FLY
          MOVING: { 0: { in: [1, 2] } }, // WALK, RUN
        },
        AIR: null,
        MOVING: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 1]], superposition }, // WALK -> MOVING
          { initialStateIndex: 0, params: [[0, 3]], superposition }, // FLY -> AIR
          { initialStateIndex: 0, params: [[0, 0]], superposition }, // IDLE -> остаётся
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("MOVING")
      expect(states[1]).toBe("AIR")
      expect(states[2]).toBe("GROUND")
    })

    test("должен перейти, если float-значение в списке", async () => {
      

      const superposition = toNumericSuperposition({
        NORMAL: {
          CRITICAL: { 0: { in: [36.6, 40.0] } },
        },
        CRITICAL: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 36.6]], superposition },
          { initialStateIndex: 0, params: [[0, 37.0]], superposition },
          { initialStateIndex: 0, params: [[0, 40.0]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("CRITICAL") // 36.6 найдено
      expect(states[1]).toBe("NORMAL") // 37.0 не найдено
      expect(states[2]).toBe("CRITICAL") // 40.0 найдено
    })
  })

  describe("Оператор NOT_IN (Исключение)", () => {
    test("должен перейти, если значение НЕ в списке", async () => {
      

      const superposition = toNumericSuperposition({
        LOBBY: {
          GAME: { 0: { notIn: [0] } }, // 0 = Spectator (not playing)
        },
        GAME: null,
      })

      await boundary.write({
        fields: [[0, { type: FieldType.F32 }]],
        branes: [
          { initialStateIndex: 0, params: [[0, 1]], superposition }, // Player -> GAME
          { initialStateIndex: 0, params: [[0, 0]], superposition }, // Spectator -> LOBBY
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("GAME")
      expect(states[1]).toBe("LOBBY")
    })
  })

  describe("Комбинированные условия", () => {
    test("должен работать с комбинацией диапазонов и списков", async () => {
      

      const superposition = toNumericSuperposition({
        START: {
          WIN: {
            0: { gt: 100 },
            1: { in: [5, 7] }, // 5=Gold, 7=Platinum
          },
        },
        WIN: null,
      })

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.F32 }],
        ],
        branes: [
          { initialStateIndex: 0, params: [[0, 150], [1, 5]], superposition }, // OK
          { initialStateIndex: 0, params: [[0, 150], [1, 1]], superposition }, // Значок не подходит
          { initialStateIndex: 0, params: [[0, 50], [1, 7]], superposition }, // Очки не подходят
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("WIN")
      expect(states[1]).toBe("START")
      expect(states[2]).toBe("START")
    })
  })
})