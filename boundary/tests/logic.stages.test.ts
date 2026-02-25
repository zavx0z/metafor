import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../src/index"

describe("Boundary — Логические стадии (bun-webgpu)", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  describe("Оператор IN (Списки)", () => {
    test("должен перейти, если значение в списке (int/enum)", async () => {
      const boundary = new Boundary()

      const superposition = {
        GROUND: {
          AIR: { mode: { in: [3] } }, // FLY
          MOVING: { mode: { in: [1, 2] } }, // WALK, RUN
        },
        AIR: null,
        MOVING: null,
      }

      await boundary.write({
        fields: { mode: { type: FieldType.F32 } },
        branes: [
          { state: "GROUND", params: { mode: 1 }, superposition }, // WALK -> MOVING
          { state: "GROUND", params: { mode: 3 }, superposition }, // FLY -> AIR
          { state: "GROUND", params: { mode: 0 }, superposition }, // IDLE -> остаётся
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("MOVING")
      expect(states[1]).toBe("AIR")
      expect(states[2]).toBe("GROUND")
    })

    test("должен перейти, если float-значение в списке", async () => {
      const boundary = new Boundary()

      const superposition = {
        NORMAL: {
          CRITICAL: { temperature: { in: [36.6, 40.0] } },
        },
        CRITICAL: null,
      }

      await boundary.write({
        fields: { temperature: { type: FieldType.F32 } },
        branes: [
          { state: "NORMAL", params: { temperature: 36.6 }, superposition },
          { state: "NORMAL", params: { temperature: 37.0 }, superposition },
          { state: "NORMAL", params: { temperature: 40.0 }, superposition },
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
      const boundary = new Boundary()

      const superposition = {
        LOBBY: {
          GAME: { role: { notIn: [0] } }, // 0 = Spectator (not playing)
        },
        GAME: null,
      }

      await boundary.write({
        fields: { role: { type: FieldType.F32 } },
        branes: [
          { state: "LOBBY", params: { role: 1 }, superposition }, // Player -> GAME
          { state: "LOBBY", params: { role: 0 }, superposition }, // Spectator -> LOBBY
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
      const boundary = new Boundary()

      const superposition = {
        START: {
          WIN: {
            score: { gt: 100 },
            badge: { in: [5, 7] }, // 5=Gold, 7=Platinum
          },
        },
        WIN: null,
      }

      await boundary.write({
        fields: { score: { type: FieldType.F32 }, badge: { type: FieldType.F32 } },
        branes: [
          { state: "START", params: { score: 150, badge: 5 }, superposition }, // OK
          { state: "START", params: { score: 150, badge: 1 }, superposition }, // Значок не подходит
          { state: "START", params: { score: 50, badge: 7 }, superposition }, // Очки не подходят
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