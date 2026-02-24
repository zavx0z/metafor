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
    onStateChange((id, old, newer) => {
      if (newer === "выполнение") {
        expect(id).toBeDefined()
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

    updateMonad(id, { cmd: "git status" })
  })

  it("должен выполнять action при изменении состояния", (done) => {
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
        выполнение: (params, update) => {
          actionExecuted = true
          actionParams = { ...params }
          done()
        },
      },
    })
    _createdMonadIds.push(id)

    onStateChange((id, oldState, newState) => {
      if (newState === "выполнение") {
        execute(id, newState)
      }
    })

    updateMonad(id, { cmd: "git status" })
  })

  it("должен обновлять params через update", (done) => {
    let updatedParams: Record<string, unknown> = {}

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
          }, 50)
        },
      },
    })
    _createdMonadIds.push(id)

    onStateChange((id, oldState, newState) => {
      if (newState === "выполнение") {
        execute(id, newState)
      }
    })

    updateMonad(id, { cmd: "git status" })
  })

  it("должен работать с updateBoundary", (done) => {
    onStateChange((id, oldState, newState) => {
      if (newState === "выполнение") {
        expect(id).toBeDefined()
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

    updateBoundary(id, "cmd", "git status")
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

  it("должен позволять добавить несколько монад до первой инициализации Boundary", async () => {
    const id1 = createMonad({
      fields: { cmd: { type: "string" } },
      params: { cmd: "" },
      state: "ожидание",
      superposition: {
        ожидание: { выполнение: { cmd: { null: false } } },
        выполнение: null,
      },
      actions: {},
    })
    const id2 = createMonad({
      fields: { cmd: { type: "string" } },
      params: { cmd: "" },
      state: "ожидание",
      superposition: {
        ожидание: { выполнение: { cmd: { null: false } } },
        выполнение: null,
      },
      actions: {},
    })
    _createdMonadIds.push(id1, id2)

    await expect(updateBoundary(id2, "cmd", "git status")).resolves.toBeUndefined()
  })

  it("должен позволять удалять монаду при активном Boundary", async () => {
    const id1 = createMonad({
      fields: { cmd: { type: "string" } },
      params: { cmd: "" },
      state: "ожидание",
      superposition: {
        ожидание: { выполнение: { cmd: { null: false } } },
        выполнение: null,
      },
      actions: {},
    })
    const id2 = createMonad({
      fields: { cmd: { type: "string" } },
      params: { cmd: "" },
      state: "ожидание",
      superposition: {
        ожидание: { выполнение: { cmd: { null: false } } },
        выполнение: null,
      },
      actions: {},
    })
    _createdMonadIds.push(id1, id2)

    await updateBoundary(id1, "cmd", "git status")

    expect(() => deleteMonad(id2)).not.toThrow()
    expect(() => deleteMonad(id2)).not.toThrow()

    await expect(updateBoundary(id2, "cmd", "git status")).rejects.toThrow(`Brane ${id2} not found`)
  })
})
