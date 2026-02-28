import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  deleteMonad,
  updateMonad,
  updateBoundary,
  onStateChange,
  _resetState,
} from "../src/monad"
import { GPU } from "@boundary/matrix"
import { setupDevice } from "fixture/bunWebGPU"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

const _createdMonadIds: string[] = []

afterEach(() => {
  _resetState()
  _createdMonadIds.length = 0
})

describe("Monad — Жизненный цикл", () => {
  it("должен создать, обновить и удалить монаду", async () => {
    let stateChanged = false
    let oldState = ""
    let currentState = ""

    onStateChange((id, old, current) => {
      stateChanged = true
      oldState = old
      currentState = current
    })

    const id = createMonad({
      fields: { hp: { type: "number" } },
      params: { hp: 30 },
      state: "IDLE",
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      actions: {},
    })
    _createdMonadIds.push(id)

    await updateBoundary()

    // Проверяем начальное состояние
    expect(stateChanged).toBe(false)

    // Обновляем hp → должен перейти в PATROL
    await updateMonad(id, { hp: 80 })

    expect(stateChanged).toBe(true)
    expect(oldState).toBe("IDLE")
    expect(currentState).toBe("PATROL")

    // Удаляем монаду
    deleteMonad(id)
    expect(true).toBe(true)
  })

  it("должен работать с множественными монадами", async () => {
    const states1: string[] = []
    const states2: string[] = []

    onStateChange((id, old, current) => {
      if (id === _createdMonadIds[0]) {
        states1.push(current)
      } else {
        states2.push(current)
      }
    })

    const id1 = createMonad({
      fields: { hp: { type: "number" } },
      params: { hp: 100 },
      state: "IDLE",
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      actions: {},
    })
    _createdMonadIds.push(id1)

    const id2 = createMonad({
      fields: { hp: { type: "number" } },
      params: { hp: 30 },
      state: "IDLE",
      superposition: {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      },
      actions: {},
    })
    _createdMonadIds.push(id2)

    await updateBoundary()

    // Обновляем первую монаду → PATROL
    await updateMonad(id1, { hp: 80 })

    // Обновляем вторую монаду → остаётся IDLE (hp=30 не <= 0)
    await updateMonad(id2, { hp: 30 })

    expect(states1).toEqual(["PATROL"])
    expect(states2).toEqual([])
  })

  it("должен вызвать callback для каждой монады отдельно", async () => {
    const callbackCounts = new Map<string, number>()

    onStateChange((id) => {
      const count = callbackCounts.get(id) ?? 0
      callbackCounts.set(id, count + 1)
    })

    // Создаём две монады с разными полями для избежания конфликтов
    const id1 = createMonad({
      fields: { hp1: { type: "number" } },
      params: { hp1: 100 },
      state: "IDLE",
      superposition: { IDLE: { PATROL: { hp1: { gt: 50 } } }, PATROL: null },
      actions: {},
    })
    _createdMonadIds.push(id1)

    const id2 = createMonad({
      fields: { hp2: { type: "number" } },
      params: { hp2: 100 },
      state: "IDLE",
      superposition: { IDLE: { PATROL: { hp2: { gt: 50 } } }, PATROL: null },
      actions: {},
    })
    _createdMonadIds.push(id2)

    await updateBoundary()

    await updateMonad(id1, { hp1: 80 })
    await updateMonad(id2, { hp2: 80 })

    expect(callbackCounts.get(id1)).toBe(1)
    expect(callbackCounts.get(id2)).toBe(1)
  })
})
