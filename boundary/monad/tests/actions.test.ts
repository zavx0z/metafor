import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  updateMonad,
  updateBoundary,
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

describe("Monad — Действия (actions)", () => {
  it("должен выполнить action при переходе в состояние", async () => {
    const executedActions: string[] = []
    const actionParams: Record<string, unknown>[] = []

    const id = createMonad({
      fields: { hp: { type: "number" } },
      params: { hp: 30 },
      state: "IDLE",
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      actions: {
        PATROL: (params) => {
          executedActions.push("PATROL")
          actionParams.push({ ...params })
        },
      },
    })
    _createdMonadIds.push(id)

    await updateBoundary()
    await updateMonad(id, { hp: 80 })

    expect(executedActions).toEqual(["PATROL"])
    expect(actionParams[0]).toEqual({ hp: 80 })
  })

  it("должен выполнить action с правильными параметрами", async () => {
    let capturedParams: Record<string, unknown> = {}

    const id = createMonad({
      fields: { hp: { type: "number" }, mana: { type: "number" } },
      params: { hp: 30, mana: 50 },
      state: "IDLE",
      superposition: {
        IDLE: { COMBAT: { hp: { gt: 50 } } },
        COMBAT: null,
      },
      actions: {
        COMBAT: (params) => {
          capturedParams = { ...params }
        },
      },
    })
    _createdMonadIds.push(id)

    await updateBoundary()
    await updateMonad(id, { hp: 80, mana: 30 })

    expect(capturedParams).toEqual({ hp: 80, mana: 30 })
  })

  it("должен выполнить разные actions для разных состояний", async () => {
    const executedActions: string[] = []

    const id = createMonad({
      fields: { hp: { type: "number" } },
      params: { hp: 100 },
      state: "IDLE",
      superposition: {
        IDLE: {
          PATROL: { hp: { gt: 50 } },
          DEAD: { hp: { lte: 0 } },
        },
        PATROL: {
          IDLE: { hp: { lte: 20 } },
        },
        DEAD: null,
      },
      actions: {
        PATROL: () => executedActions.push("PATROL"),
        DEAD: () => executedActions.push("DEAD"),
        IDLE: () => executedActions.push("IDLE"),
      },
    })
    _createdMonadIds.push(id)

    await updateBoundary()

    // hp=100 > 50 → PATROL
    await updateMonad(id, { hp: 100 })
    expect(executedActions).toEqual(["PATROL"])

    // hp=15 <= 20 → IDLE
    await updateMonad(id, { hp: 15 })
    expect(executedActions).toEqual(["PATROL", "IDLE"])

    // hp=0 <= 0 → DEAD
    await updateMonad(id, { hp: 0 })
    expect(executedActions).toEqual(["PATROL", "IDLE", "DEAD"])
  })

  it("должен выполнить action только один раз при переходе", async () => {
    let actionCallCount = 0

    const id = createMonad({
      fields: { hp: { type: "number" } },
      params: { hp: 100 },
      state: "IDLE",
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      actions: {
        PATROL: () => {
          actionCallCount++
        },
      },
    })
    _createdMonadIds.push(id)

    await updateBoundary()

    // Переход в PATROL
    await updateMonad(id, { hp: 80 })
    expect(actionCallCount).toBe(1)

    // Остаётся в PATROL (action не должен выполниться снова)
    await updateMonad(id, { hp: 90 })
    expect(actionCallCount).toBe(1)
  })

  it("должен выполнить action при цепочке переходов", async () => {
    const executedActions: string[] = []

    const id = createMonad({
      fields: { hp: { type: "number" }, mana: { type: "number" } },
      params: { hp: 100, mana: 100 },
      state: "IDLE",
      superposition: {
        IDLE: { PATROL: { hp: { gt: 80 } } },
        PATROL: { COMBAT: { mana: { lt: 20 } } },
        COMBAT: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      },
      actions: {
        PATROL: () => executedActions.push("PATROL"),
        COMBAT: () => executedActions.push("COMBAT"),
        DEAD: () => executedActions.push("DEAD"),
      },
    })
    _createdMonadIds.push(id)

    await updateBoundary()

    // hp=100>80 → PATROL
    await updateMonad(id, { hp: 100 })
    expect(executedActions).toEqual(["PATROL"])

    // mana=10<20 → COMBAT
    await updateMonad(id, { mana: 10 })
    expect(executedActions).toEqual(["PATROL", "COMBAT"])

    // hp=0<=0 → DEAD
    await updateMonad(id, { hp: 0 })
    expect(executedActions).toEqual(["PATROL", "COMBAT", "DEAD"])
  })
})
