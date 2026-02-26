import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  updateMonad,
  updateBoundary,
  onStateChange,
  _resetState,
} from "../../src/monad"
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

describe("Monad — Булевы переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (_id: string, _old: string, current: string) => {
      resultStates.push(current)
    }
  }

  describe("Прямое значение", () => {
    it("должен выполнить переход при isAlive === true", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isAlive: { type: "boolean" } },
        params: { isAlive: false },
        state: "INACTIVE",
        superposition: {
          INACTIVE: { ACTIVE: { isAlive: true } },
          ACTIVE: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { isAlive: true })

      expect(resultStates).toEqual(["ACTIVE"])
    })

    it("должен выполнить переход при isActive === false", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isActive: { type: "boolean" } },
        params: { isActive: true },
        state: "ACTIVE",
        superposition: {
          ACTIVE: { INACTIVE: { isActive: false } },
          INACTIVE: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { isActive: false })

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
        state: "DISCONNECTED",
        superposition: {
          DISCONNECTED: { CONNECTED: { isConnected: { eq: true } } },
          CONNECTED: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { isConnected: true })

      expect(resultStates).toEqual(["CONNECTED"])
    })

    it("должен выполнить переход при isConnected === false", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isConnected: { type: "boolean" } },
        params: { isConnected: true },
        state: "CONNECTED",
        superposition: {
          CONNECTED: { DISCONNECTED: { isConnected: { eq: false } } },
          DISCONNECTED: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { isConnected: false })

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
        state: "ENABLED",
        superposition: {
          ENABLED: { DISABLED: { isEnabled: { neq: true } } },
          DISABLED: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { isEnabled: false })

      expect(resultStates).toEqual(["DISABLED"])
    })

    it("должен выполнить переход при isEnabled !== false", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isEnabled: { type: "boolean" } },
        params: { isEnabled: false },
        state: "DISABLED",
        superposition: {
          DISABLED: { ENABLED: { isEnabled: { neq: false } } },
          ENABLED: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { isEnabled: true })

      expect(resultStates).toEqual(["ENABLED"])
    })
  })
})
