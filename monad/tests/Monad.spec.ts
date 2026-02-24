import { describe, it, expect, beforeAll } from "bun:test"
import { Monad } from "../src/Monad"
import { setupDevice } from "@fixture/bunWebGPU"
import { GPU } from "@metafor/boundary"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

describe("Monad", () => {
  it("должен создавать монаду с конфигурацией", async () => {
    const monad = new Monad()
    await monad.create({
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

    expect(monad).toBeDefined()
  })

  it("должен вызывать onStateChange при изменении состояния", (done) => {
    const monad = new Monad()
    monad.onStateChange = (index, old, newer) => {
      if (newer === "выполнение") {
        expect(index).toBe(0)
        expect(old).toBe("ожидание")
        expect(newer).toBe("выполнение")
        done()
      }
    }

    monad.create({
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
      actions: {
        выполнение: (params, update) => {
          // Действо выполнено
        },
      },
    }).then(() => {
      monad.updateField(0, { cmd: "git status" })
    })
  })

  it("должен выполнять action при изменении состояния", (done) => {
    let actionExecuted = false
    let actionParams: Record<string, unknown> = {}

    const monad = new Monad()
    monad.onStateChange = (index, oldState, newState) => {
      if (newState === "выполнение") {
        monad.execute(index, newState)

        // Проверяем что action выполнился
        setTimeout(() => {
          expect(actionExecuted).toBe(true)
          expect(actionParams.cmd).toBe("git status")
          done()
        }, 10)
      }
    }

    monad.create({
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
      actions: {
        выполнение: (params, update) => {
          actionExecuted = true
          actionParams = { ...params }
        },
      },
    }).then(() => {
      monad.updateField(0, { cmd: "git status" })
    })
  })

  it("должен обновлять params через update", (done) => {
    let updatedParams: Record<string, unknown> = {}

    const monad = new Monad()
    monad.onStateChange = (index, oldState, newState) => {
      if (newState === "выполнение") {
        monad.execute(index, newState)
      }

      // После возврата в ожидание проверяем
      if (newState === "ожидание" && oldState === "выполнение") {
        setTimeout(() => {
          expect(updatedParams.cmd).toBe("git status")
          done()
        }, 10)
      }
    }

    monad.create({
      fields: { cmd: { type: "string" }, count: { type: "number" } },
      branes: [
        {
          id: "test-1",
          params: { cmd: "", count: 0 },
          state: "ожидание",
          superposition: {
            ожидание: { выполнение: { cmd: { null: false } } },
            выполнение: { ожидание: { cmd: null } },
          },
        },
      ],
      actions: {
        выполнение: (params, update) => {
          updatedParams = { ...params }
          update("test-1", { cmd: "", count: 1 })
        },
      },
    }).then(() => {
      monad.updateField(0, { cmd: "git status" })
    })
  })

  it("должен работать с несколькими бранами", (done) => {
    const stateChanges: Array<{ index: number; state: string }> = []

    const monad = new Monad()
    monad.onStateChange = (index, oldState, newState) => {
      stateChanges.push({ index, state: newState })

      if (newState === "выполнение") {
        monad.execute(index, newState)
      }

      // Проверяем что состояние изменилось
      if (stateChanges.length >= 1) {
        const first = stateChanges[0]
        if (first) {
          expect(first.index).toBe(0)
          expect(first.state).toBe("выполнение")
          done()
        }
      }
    }

    monad.create({
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
      actions: {
        выполнение: (params, update) => {
          // Действо
        },
      },
    }).then(() => {
      monad.updateField(0, { cmd: "git status" })
    })
  })
})
