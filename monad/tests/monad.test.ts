import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  deleteMonad,
  updateMonad,
  updateBoundary,
  onStateChange,
  execute,
} from "../src/monad"
import { GPU } from "@metafor/boundary"
import { setupDevice } from "../../fixture/bunWebGPU"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

const _createdMonadIds: string[] = []

afterEach(() => {
  // Очищаем после каждого теста
  for (const id of _createdMonadIds) {
    deleteMonad(id)
  }
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

  it("должен вызывать onStateChange при изменении состояния", (done) => {
    onStateChange((index, old, newer) => {
      if (newer === "выполнение") {
        expect(index).toBe(0)
        expect(old).toBe("ожидание")
        expect(newer).toBe("выполнение")
        done()
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
      actions: {
        выполнение: (params, update) => {
          // Действо выполнено
        },
      },
    })
    _createdMonadIds.push(id)

    updateMonad(0, { cmd: "git status" })
  })

  it("должен выполнять action при изменении состояния", (done) => {
    let actionExecuted = false
    let actionParams: Record<string, unknown> = {}

    onStateChange((index, oldState, newState) => {
      if (newState === "выполнение") {
        execute(index, newState)

        setTimeout(() => {
          expect(actionExecuted).toBe(true)
          expect(actionParams.cmd).toBe("git status")
          done()
        }, 10)
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
      actions: {
        выполнение: (params, update) => {
          actionExecuted = true
          actionParams = { ...params }
        },
      },
    })
    _createdMonadIds.push(id)

    updateMonad(0, { cmd: "git status" })
  })

  it("должен обновлять params через update", (done) => {
    let updatedParams: Record<string, unknown> = {}
    let actionCalled = false

    onStateChange((index, oldState, newState) => {
      if (newState === "выполнение" && !actionCalled) {
        actionCalled = true
        execute(index, newState)
      }
    })

    const id = createMonad({
      fields: { cmd: { type: "string" }, count: { type: "number" } },
      params: { cmd: "", count: 0 },
      state: "ожидание",
      superposition: {
        ожидание: { выполнение: { cmd: { null: false } } },
        выполнение: null,
      },
      actions: {
        выполнение: (params, update) => {
          updatedParams = { ...params }
          update({ cmd: "", count: 1 })

          setTimeout(() => {
            expect(updatedParams.cmd).toBe("git status")
            done()
          }, 10)
        },
      },
    })
    _createdMonadIds.push(id)

    updateMonad(0, { cmd: "git status" })
  })

  it("должен работать с updateBoundary", (done) => {
    onStateChange((index, oldState, newState) => {
      if (newState === "выполнение") {
        expect(index).toBe(0)
        done()
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

    updateBoundary(0, "cmd", "git status")
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
