import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  updateMonads,
  updateBoundary,
  onStateChange,
  _resetState,
  type BraneStateChange,
} from "../../monad"
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

describe("Monad — Булевы переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (changes: BraneStateChange[]) => {
      for (const change of changes) {
        if (change.oldState === undefined) continue
        resultStates.push(change.newState)
      }
    }
  }

  describe("Прямое значение", () => {
    it("должен выполнить переход при isAlive === true", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isAlive: { type: "boolean" } },
        params: { isAlive: false },
        superposition: {
          INACTIVE: { ACTIVE: { isAlive: true } },
          ACTIVE: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { isAlive: true } }])

      expect(resultStates).toEqual(["ACTIVE"])
    })

    it("должен выполнить переход при isActive === false", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isActive: { type: "boolean" } },
        params: { isActive: true },
        superposition: {
          ACTIVE: { INACTIVE: { isActive: false } },
          INACTIVE: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { isActive: false } }])

      expect(resultStates).toEqual(["INACTIVE"])
    })
  })

  describe("eq (равно)", () => {
    it("должен выполнить переход при isConnected === true", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isConnected: { type: "boolean" } },
        params: { isConnected: false },
        superposition: {
          DISCONNECTED: { CONNECTED: { isConnected: { eq: true } } },
          CONNECTED: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { isConnected: true } }])

      expect(resultStates).toEqual(["CONNECTED"])
    })

    it("должен выполнить переход при isConnected === false", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isConnected: { type: "boolean" } },
        params: { isConnected: true },
        superposition: {
          CONNECTED: { DISCONNECTED: { isConnected: { eq: false } } },
          DISCONNECTED: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { isConnected: false } }])

      expect(resultStates).toEqual(["DISCONNECTED"])
    })
  })

  describe("neq (не равно)", () => {
    it("должен выполнить переход при isEnabled !== true", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isEnabled: { type: "boolean" } },
        params: { isEnabled: true },
        superposition: {
          ENABLED: { DISABLED: { isEnabled: { neq: true } } },
          DISABLED: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { isEnabled: false } }])

      expect(resultStates).toEqual(["DISABLED"])
    })

    it("должен выполнить переход при isEnabled !== false", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isEnabled: { type: "boolean" } },
        params: { isEnabled: false },
        superposition: {
          DISABLED: { ENABLED: { isEnabled: { neq: false } } },
          ENABLED: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { isEnabled: true } }])

      expect(resultStates).toEqual(["ENABLED"])
    })
  })
})
