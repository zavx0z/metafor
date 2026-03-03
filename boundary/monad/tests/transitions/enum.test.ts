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

describe("Monad — Enum переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (changes: BraneStateChange[]) => {
      for (const change of changes) {
        resultStates.push(change.newState)
      }
    }
  }

  describe("eq (равно)", () => {
    it("должен выполнить переход при status === 'active'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { status: { type: "enum<string>", values: ["idle", "active", "paused"] } },
        params: { status: "idle" },
        superposition: {
          IDLE: { ACTIVE: { status: { eq: "active" } } },
          ACTIVE: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { status: "active" } }])

      expect(resultStates).toEqual(["ACTIVE"])
    })

    it("не должен выполнить переход при status !== 'active'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { status: { type: "enum<string>", values: ["idle", "active", "paused"] } },
        params: { status: "idle" },
        superposition: {
          IDLE: { ACTIVE: { status: { eq: "active" } } },
          ACTIVE: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { status: "paused" } }])

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
        superposition: {
          IDLE: { CHANGED: { status: { neq: "idle" } } },
          CHANGED: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { status: "active" } }])

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
        superposition: {
          IDLE: { NOT_IDLE: { status: { in: ["active", "paused"] } } },
          NOT_IDLE: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { status: "paused" } }])

      expect(resultStates).toEqual(["NOT_IDLE"])
    })

    it("не должен выполнить переход при status not in ['active', 'paused']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { status: { type: "enum<string>", values: ["idle", "active", "paused"] } },
        params: { status: "idle" },
        superposition: {
          IDLE: { NOT_IDLE: { status: { in: ["active", "paused"] } } },
          NOT_IDLE: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { status: "idle" } }])

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
        superposition: {
          UNDEFINED: { ALLY: { role: { notIn: ["enemy", "neutral"] } } },
          ALLY: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { role: "ally" } }])

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
        superposition: {
          IDLE: { URGENT: { priority: { gt: "low" } } },
          URGENT: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { priority: "high" } }])

      expect(resultStates).toEqual(["URGENT"])
    })

    it("не должен выполнить переход при priority === 'low'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { priority: { type: "enum<string>", values: ["low", "medium", "high"] } },
        params: { priority: "low" },
        superposition: {
          IDLE: { URGENT: { priority: { gt: "low" } } },
          URGENT: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { priority: "low" } }])

      expect(resultStates).toEqual([])
    })
  })
})
