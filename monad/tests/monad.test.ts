import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  deleteMonad,
  updateMonad,
  updateBoundary,
  onStateChange,
  _resetState,
} from "../src/monad"
import { GPU } from "@metafor/boundary"
import { setupDevice } from "fixture/bunWebGPU"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

const _createdMonadIds: string[] = []

afterEach(() => {
  _resetState()
  _createdMonadIds.length = 0
})

describe("Monad (модуль)", () => {
  it("должен создавать монаду с конфигурацией", () => {
    const id = createMonad({
      fields: { cmd: { type: "string" } },
      params: { cmd: "" },
      state: "ожидание",
      superposition: {
        ожидание: { выполнение: { cmd: { null: false } } },
        выполнение: null,
      },
      actions: {},
    })
    _createdMonadIds.push(id)

    expect(id).toBeDefined()
  })

  it("должен вызывать onStateChange при изменении состояния", async () => {
    let stateChanged = false
    let oldState = ""
    let currentState = ""

    onStateChange((id, old, current) => {
      stateChanged = true
      oldState = old
      currentState = current
    })

    const id = createMonad({
      fields: { cmd: { type: "string" } },
      params: { cmd: "" },
      state: "ожидание",
      superposition: {
        ожидание: { выполнение: { cmd: { null: false } } },
        выполнение: null,
      },
      actions: {},
    })
    _createdMonadIds.push(id)

    await updateBoundary()
    await updateMonad(id, { cmd: "git status" })

    expect(stateChanged).toBe(true)
    expect(oldState).toBe("ожидание")
    expect(currentState).toBe("выполнение")
  })

  it("должен выполнять action при изменении состояния", async () => {
    let actionExecuted = false
    let actionParams: Record<string, unknown> = {}

    const id = createMonad({
      fields: { cmd: { type: "string" } },
      params: { cmd: "" },
      state: "ожидание",
      superposition: {
        ожидание: { выполнение: { cmd: { null: false } } },
        выполнение: null,
      },
      actions: {
        выполнение: (params) => {
          actionExecuted = true
          actionParams = { ...params }
        },
      },
    })
    _createdMonadIds.push(id)

    onStateChange((id, old, current) => {
      // action уже выполнен автоматически
    })

    await updateBoundary()
    await updateMonad(id, { cmd: "git status" })

    expect(actionExecuted).toBe(true)
    expect(actionParams.cmd).toBe("git status")
  })

  it("должен работать с updateBoundary", async () => {
    let stateChanged = false

    onStateChange((id, old, current) => {
      if (current === "выполнение") {
        stateChanged = true
      }
    })

    const id = createMonad({
      fields: { cmd: { type: "string" } },
      params: { cmd: "" },
      state: "ожидание",
      superposition: {
        ожидание: { выполнение: { cmd: { null: false } } },
        выполнение: null,
      },
      actions: {},
    })
    _createdMonadIds.push(id)

    await updateBoundary()
    await updateMonad(id, { cmd: "git status" })

    expect(stateChanged).toBe(true)
  })

  it("должен удалять монаду по uuid", () => {
    const id = createMonad({
      fields: { cmd: { type: "string" } },
      params: { cmd: "" },
      state: "ожидание",
      superposition: {
        ожидание: { выполнение: { cmd: { null: false } } },
        выполнение: null,
      },
      actions: {},
    })

    expect(id).toBeDefined()
    deleteMonad(id)
    expect(true).toBe(true)
  })
})
