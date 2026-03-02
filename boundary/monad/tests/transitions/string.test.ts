import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  updateMonads,
  updateBoundary,
  onStateChange,
  _resetState,
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

describe("Monad — Строковые переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (changes: Array<{ monadId: string; oldState: string; newState: string; intention?: string | null; params: Record<string, unknown> }>) => {
      for (const change of changes) {
        resultStates.push(change.newState)
      }
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
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { command: "attack" } }])

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
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { command: "defend" } }])

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
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { status: "critical" } }])

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
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { status: "normal" } }])

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
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { color: "red" } }])

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
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { color: "blue" } }])

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
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { role: "ally" } }])

      expect(resultStates).toEqual(["ALLY"])
    })

    it("не должен выполнить переход при role in ['enemy', 'neutral']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { role: { type: "string" } },
        params: { role: "enemy" },
        state: "UNDEFINED",
        superposition: {
          UNDEFINED: { ALLY: { role: { notIn: ["enemy", "neutral"] } } },
          ALLY: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { role: "enemy" } }])

      expect(resultStates).toEqual([])
    })
  })
})
