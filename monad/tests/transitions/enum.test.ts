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

describe("Monad — Enum переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (_id: string, _old: string, current: string) => {
      resultStates.push(current)
    }
  }

  describe("eq (равно)", () => {
    it("должен выполнить переход при status === 'active'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { status: { type: "enum<string>", values: ["idle", "active", "paused"] } },
        params: { status: "idle" },
        state: "IDLE",
        superposition: {
          IDLE: { ACTIVE: { status: { eq: "active" } } },
          ACTIVE: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { status: "active" })

      expect(resultStates).toEqual(["ACTIVE"])
    })

    it("не должен выполнить переход при status !== 'active'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { status: { type: "enum<string>", values: ["idle", "active", "paused"] } },
        params: { status: "idle" },
        state: "IDLE",
        superposition: {
          IDLE: { ACTIVE: { status: { eq: "active" } } },
          ACTIVE: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { status: "paused" })

      expect(resultStates).toEqual([])
    })
  })

  describe("neq (не равно)", () => {
    it("должен выполнить переход при status !== 'idle'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { status: { type: "enum<string>", values: ["idle", "active", "paused"] } },
        params: { status: "idle" },
        state: "IDLE",
        superposition: {
          IDLE: { CHANGED: { status: { neq: "idle" } } },
          CHANGED: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { status: "active" })

      expect(resultStates).toEqual(["CHANGED"])
    })
  })

  describe("in (в списке)", () => {
    it("должен выполнить переход при status in ['active', 'paused']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { status: { type: "enum<string>", values: ["idle", "active", "paused"] } },
        params: { status: "idle" },
        state: "IDLE",
        superposition: {
          IDLE: { NOT_IDLE: { status: { in: ["active", "paused"] } } },
          NOT_IDLE: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { status: "paused" })

      expect(resultStates).toEqual(["NOT_IDLE"])
    })

    it("не должен выполнить переход при status not in ['active', 'paused']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { status: { type: "enum<string>", values: ["idle", "active", "paused"] } },
        params: { status: "idle" },
        state: "IDLE",
        superposition: {
          IDLE: { NOT_IDLE: { status: { in: ["active", "paused"] } } },
          NOT_IDLE: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { status: "idle" })

      expect(resultStates).toEqual([])
    })
  })

  describe("notIn (не в списке)", () => {
    it("должен выполнить переход при role notIn ['enemy', 'neutral']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { role: { type: "enum<string>", values: ["ally", "enemy", "neutral"] } },
        params: { role: "ally" },
        state: "UNDEFINED",
        superposition: {
          UNDEFINED: { ALLY: { role: { notIn: ["enemy", "neutral"] } } },
          ALLY: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { role: "ally" })

      expect(resultStates).toEqual(["ALLY"])
    })
  })

  describe("gt/lt (больше/меньше по индексу)", () => {
    it("должен выполнить переход при priority > 'low' (индекс больше)", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { priority: { type: "enum<string>", values: ["low", "medium", "high"] } },
        params: { priority: "low" },
        state: "IDLE",
        superposition: {
          IDLE: { URGENT: { priority: { gt: "low" } } },
          URGENT: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { priority: "high" })

      expect(resultStates).toEqual(["URGENT"])
    })

    it("не должен выполнить переход при priority === 'low'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { priority: { type: "enum<string>", values: ["low", "medium", "high"] } },
        params: { priority: "low" },
        state: "IDLE",
        superposition: {
          IDLE: { URGENT: { priority: { gt: "low" } } },
          URGENT: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { priority: "low" })

      expect(resultStates).toEqual([])
    })
  })
})
