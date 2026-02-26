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

describe("Monad — Строковые переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (_id: string, _old: string, current: string) => {
      resultStates.push(current)
    }
  }

  describe("eq (равно)", () => {
    it("должен выполнить переход при command === 'attack'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { command: { type: "string" } },
        params: { command: "" },
        state: "IDLE",
        superposition: {
          IDLE: { ATTACK: { command: { eq: "attack" } } },
          ATTACK: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { command: "attack" })

      expect(resultStates).toEqual(["ATTACK"])
    })

    it("не должен выполнить переход при command !== 'attack'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { command: { type: "string" } },
        params: { command: "" },
        state: "IDLE",
        superposition: {
          IDLE: { ATTACK: { command: { eq: "attack" } } },
          ATTACK: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { command: "defend" })

      expect(resultStates).toEqual([])
    })
  })

  describe("neq (не равно)", () => {
    it("должен выполнить переход при status !== 'normal'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { status: { type: "string" } },
        params: { status: "normal" },
        state: "NORMAL",
        superposition: {
          NORMAL: { ABNORMAL: { status: { neq: "normal" } } },
          ABNORMAL: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { status: "critical" })

      expect(resultStates).toEqual(["ABNORMAL"])
    })

    it("не должен выполнить переход при status === 'normal'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { status: { type: "string" } },
        params: { status: "normal" },
        state: "NORMAL",
        superposition: {
          NORMAL: { ABNORMAL: { status: { neq: "normal" } } },
          ABNORMAL: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { status: "normal" })

      expect(resultStates).toEqual([])
    })
  })

  describe("in (в списке)", () => {
    it("должен выполнить переход при color in ['red', 'green']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { color: { type: "string" } },
        params: { color: "" },
        state: "NEUTRAL",
        superposition: {
          NEUTRAL: { ACTIVE: { color: { in: ["red", "green"] } } },
          ACTIVE: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { color: "red" })

      expect(resultStates).toEqual(["ACTIVE"])
    })

    it("не должен выполнить переход при color not in ['red', 'green']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { color: { type: "string" } },
        params: { color: "" },
        state: "NEUTRAL",
        superposition: {
          NEUTRAL: { ACTIVE: { color: { in: ["red", "green"] } } },
          ACTIVE: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { color: "blue" })

      expect(resultStates).toEqual([])
    })
  })

  describe("notIn (не в списке)", () => {
    it("должен выполнить переход при role notIn ['enemy', 'neutral']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { role: { type: "string" } },
        params: { role: "" },
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

    it("не должен выполнить переход при role in ['enemy', 'neutral']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { role: { type: "string" } },
        params: { role: "" },
        state: "UNDEFINED",
        superposition: {
          UNDEFINED: { ALLY: { role: { notIn: ["enemy", "neutral"] } } },
          ALLY: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { role: "enemy" })

      expect(resultStates).toEqual([])
    })
  })
})
