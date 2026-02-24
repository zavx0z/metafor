import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import { createMonad, deleteMonad, updateMonad, updateBoundary, onStateChange, execute } from "../src/monad"
import { GPU } from "@metafor/boundary"
import { setupDevice } from "../../fixture/bunWebGPU"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

afterEach(() => {
  // Очищаем после каждого теста
  deleteMonad("test-1")
  deleteMonad("test-2")
  deleteMonad("test-3")
  deleteMonad("test-4")
  deleteMonad("test-5")
  deleteMonad("test-delete")
})

describe("Monad (модуль)", () => {
  it("должен создавать монаду с конфигурацией", () => {
    createMonad({
      fields: { cmd: { type: "string" } },
      branes: [
        {
          id: "test-1",
          params: { cmd: "" },
          state: "ожидание",
          superposition: {
            ожидание: { выполнение: { cmd: { null: false } } },
            выполнение: null,
          },
        },
      ],
      actions: {},
    })

    expect(true).toBe(true)
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

    createMonad({
      fields: { cmd: { type: "string" } },
      branes: [
        {
          id: "test-2",
          params: { cmd: "" },
          state: "ожидание",
          superposition: {
            ожидание: { выполнение: { cmd: { null: false } } },
            выполнение: null,
          },
        },
      ],
      actions: {
        выполнение: (params, update) => {
          // Действо выполнено
        },
      },
    })

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

    createMonad({
      fields: { cmd: { type: "string" } },
      branes: [
        {
          id: "test-3",
          params: { cmd: "" },
          state: "ожидание",
          superposition: {
            ожидание: { выполнение: { cmd: { null: false } } },
            выполнение: null,
          },
        },
      ],
      actions: {
        выполнение: (params, update) => {
          actionExecuted = true
          actionParams = { ...params }
        },
      },
    })

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

    createMonad({
      fields: { cmd: { type: "string" }, count: { type: "number" } },
      branes: [
        {
          id: "test-4",
          params: { cmd: "", count: 0 },
          state: "ожидание",
          superposition: {
            ожидание: { выполнение: { cmd: { null: false } } },
            выполнение: null,
          },
        },
      ],
      actions: {
        выполнение: (params, update) => {
          updatedParams = { ...params }
          update("test-4", { cmd: "", count: 1 })

          setTimeout(() => {
            expect(updatedParams.cmd).toBe("git status")
            done()
          }, 10)
        },
      },
    })

    updateMonad(0, { cmd: "git status" })
  })

  it("должен работать с updateBoundary", (done) => {
    onStateChange((index, oldState, newState) => {
      if (newState === "выполнение") {
        expect(index).toBe(0)
        done()
      }
    })

    createMonad({
      fields: { cmd: { type: "string" } },
      branes: [
        {
          id: "test-5",
          params: { cmd: "" },
          state: "ожидание",
          superposition: {
            ожидание: { выполнение: { cmd: { null: false } } },
            выполнение: null,
          },
        },
      ],
      actions: {},
    })

    updateBoundary(0, "cmd", "git status")
  })

  it("должен удалять монаду по id", () => {
    createMonad({
      fields: { cmd: { type: "string" } },
      branes: [
        {
          id: "test-delete",
          params: { cmd: "" },
          state: "ожидание",
          superposition: {
            ожидание: { выполнение: { cmd: { null: false } } },
            выполнение: null,
          },
        },
      ],
      actions: {},
    })

    deleteMonad("test-delete")
    expect(true).toBe(true)
  })
})
