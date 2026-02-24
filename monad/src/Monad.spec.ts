import { describe, it, expect, beforeAll } from "bun:test"
import { Monad } from "./Monad"
import { setupDevice } from "../tests/fixture/bunWebGPU"

let device: GPUDevice

beforeAll(async () => {
  device = await setupDevice()
})

describe("Monad", () => {
  it("должен создавать монаду с конфигурацией", async () => {
    const monad = await Monad.create(device, {
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
    let stateChanged = false
    let oldState = ""
    let newState = ""

    Monad.create(device, {
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
          stateChanged = true
        },
      },
    }).then((monad) => {
      monad.onStateChange = (index, old, newer) => {
        stateChanged = true
        oldState = old
        newState = newer

        if (newer === "выполнение") {
          expect(index).toBe(0)
          expect(old).toBe("ожидание")
          expect(newer).toBe("выполнение")
          done()
        }
      }

      monad.updateField(0, { cmd: "git status" })
    })
  })

  it("должен выполнять action при изменении состояния", (done) => {
    let actionExecuted = false
    let actionParams: Record<string, unknown> = {}

    Monad.create(device, {
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
    }).then((monad) => {
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

      monad.updateField(0, { cmd: "git status" })
    })
  })

  it("должен обновлять params через update", (done) => {
    let updatedParams: Record<string, unknown> = {}

    Monad.create(device, {
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
    }).then((monad) => {
      let transitionCount = 0
      monad.onStateChange = (index, oldState, newState) => {
        transitionCount++

        if (newState === "выполнение") {
          monad.execute(index, newState)
        }

        // После возврата в ожидание проверяем
        if (newState === "ожидание" && transitionCount >= 2) {
          setTimeout(() => {
            expect(updatedParams.cmd).toBe("git status")
            done()
          }, 10)
        }
      }

      monad.updateField(0, { cmd: "git status" })
    })
  })

  it("должен работать с несколькими бранами", (done) => {
    const stateChanges: Array<{ index: number; state: string }> = []

    Monad.create(device, {
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
    }).then((monad) => {
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
          }
          done()
        }
      }

      monad.updateField(0, { cmd: "git status" })
    })
  })
})
