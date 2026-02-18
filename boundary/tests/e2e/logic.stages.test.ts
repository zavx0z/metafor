import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BrowserWebGPU } from "../fixture/browserWebGPU"

describe("Boundary — логика переходов (GPU)", () => {
  beforeAll(async () => await BrowserWebGPU.setup())
  afterAll(async () => await BrowserWebGPU.teardown(), 20000)
  const fixture = new BrowserWebGPU()

  describe("Оператор IN (Списки)", () => {
    test("должен перейти если значение в списке (целое/enum)", async () => {
      const superposition = {
        GROUND: {
          AIR: { mode: { in: [3] } }, // FLY
          MOVING: { mode: { in: [1, 2] } }, // WALK, RUN
        },
        AIR: null,
        MOVING: null,
      }
      // Эмуляция enum: 0=IDLE, 1=WALK, 2=RUN, 3=FLY
      const result = await fixture.runSimulation({
        fields: { mode: { type: "number" } },
        branes: [
          { id: "q1", state: "GROUND", params: { mode: 1 }, superposition }, // WALK -> MOVING
          { id: "q2", state: "GROUND", params: { mode: 3 }, superposition }, // FLY -> AIR
          { id: "q3", state: "GROUND", params: { mode: 0 }, superposition }, // IDLE -> остаётся
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("MOVING")
      expect(result.states![1]).toBe("AIR")
      expect(result.states![2]).toBe("GROUND")
    })

    test("должен перейти если float-значение в списке", async () => {
      const superposition = {
        NORMAL: {
          CRITICAL: { temperature: { in: [36.6, 40.0] } },
        },
        CRITICAL: null,
      }
      const result = await fixture.runSimulation({
        fields: { temperature: { type: "number" } },
        branes: [
          { id: "q1", state: "NORMAL", params: { temperature: 36.6 }, superposition },
          { id: "q2", state: "NORMAL", params: { temperature: 37.0 }, superposition },
          { id: "q3", state: "NORMAL", params: { temperature: 40.0 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("CRITICAL") // 36.6 найдено
      expect(result.states![1]).toBe("NORMAL") // 37.0 не найдено
      expect(result.states![2]).toBe("CRITICAL") // 40.0 найдено
    })
  })

  describe("Оператор NOT_IN (Исключение)", () => {
    test("должен перейти если значение НЕ в списке", async () => {
      const superposition = {
        LOBBY: {
          GAME: { role: { notIn: [0] } }, // 0 = Зритель (не играет)
        },
        GAME: null,
      }
      const result = await fixture.runSimulation({
        fields: { role: { type: "number" } },
        branes: [
          { id: "q1", state: "LOBBY", params: { role: 1 }, superposition }, // Игрок -> GAME
          { id: "q2", state: "LOBBY", params: { role: 0 }, superposition }, // Зритель -> LOBBY
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("GAME")
      expect(result.states![1]).toBe("LOBBY")
    })
  })

  describe("Комбинированные условия", () => {
    test("должен работать с комбинацией диапазонов и списков", async () => {
      const superposition = {
        START: {
          WIN: {
            score: { gt: 100 },
            badge: { in: [5, 7] }, // 5=Золото, 7=Платина
          },
        },
        WIN: null,
      }
      const result = await fixture.runSimulation({
        fields: { score: { type: "number" }, badge: { type: "number" } },
        branes: [
          { id: "q1", state: "START", params: { score: 150, badge: 5 }, superposition }, // OK
          { id: "q2", state: "START", params: { score: 150, badge: 1 }, superposition }, // Значок не подходит
          { id: "q3", state: "START", params: { score: 50, badge: 7 }, superposition }, // Счёт не подходит
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states![0]).toBe("WIN")
      expect(result.states![1]).toBe("START")
      expect(result.states![2]).toBe("START")
    })
  })
})
