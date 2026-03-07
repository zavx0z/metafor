import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  updateMonads,
  updateBoundary,
  onStateChange,
  _resetState,
  type BraneStateChange,
} from "../../index"
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
    return (changes: BraneStateChange[]) => {
      for (const change of changes) {
        // Игнорируем событие рождения: undefined -> first state
        if (change.oldState === undefined) continue
        resultStates.push(change.newState)
      }
    }
  }

  describe("eq (равно)", () => {
    it("должен выполнить переход при command === 'attack'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { command: { type: "string" } },
        values: { command: "" },
        superposition: {
          IDLE: { ATTACK: { command: { eq: "attack" } } },
          ATTACK: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { command: "attack" } }])

      expect(resultStates).toEqual(["ATTACK"])
    })

    it("не должен выполнить переход при command !== 'attack'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { command: { type: "string" } },
        values: { command: "" },
        superposition: {
          IDLE: { ATTACK: { command: { eq: "attack" } } },
          ATTACK: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { command: "defend" } }])

      expect(resultStates).toEqual([])
    })
  })

  describe("neq (не равно)", () => {
    it("должен выполнить переход при status !== 'normal'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { status: { type: "string" } },
        values: { status: "normal" },
        superposition: {
          NORMAL: { ABNORMAL: { status: { neq: "normal" } } },
          ABNORMAL: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { status: "critical" } }])

      expect(resultStates).toEqual(["ABNORMAL"])
    })

    it("не должен выполнить переход при status === 'normal'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { status: { type: "string" } },
        values: { status: "normal" },
        superposition: {
          NORMAL: { ABNORMAL: { status: { neq: "normal" } } },
          ABNORMAL: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { status: "normal" } }])

      expect(resultStates).toEqual([])
    })
  })

  describe("in (в списке)", () => {
    it("должен выполнить переход при color in ['red', 'green']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { color: { type: "string" } },
        values: { color: "" },
        superposition: {
          NEUTRAL: { ACTIVE: { color: { in: ["red", "green"] } } },
          ACTIVE: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { color: "red" } }])

      expect(resultStates).toEqual(["ACTIVE"])
    })

    it("не должен выполнить переход при color not in ['red', 'green']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { color: { type: "string" } },
        values: { color: "" },
        superposition: {
          NEUTRAL: { ACTIVE: { color: { in: ["red", "green"] } } },
          ACTIVE: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { color: "blue" } }])

      expect(resultStates).toEqual([])
    })
  })

  describe("notIn (не в списке)", () => {
    it("должен выполнить переход при role notIn ['enemy', 'neutral']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { role: { type: "string" } },
        values: { role: "" },
        superposition: {
          UNDEFINED: { ALLY: { role: { notIn: ["enemy", "neutral"] } } },
          ALLY: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { role: "ally" } }])

      expect(resultStates).toEqual(["ALLY"])
    })

    it("не должен выполнить переход при role in ['enemy', 'neutral']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { role: { type: "string" } },
        values: { role: "enemy" },
        superposition: {
          UNDEFINED: { ALLY: { role: { notIn: ["enemy", "neutral"] } } },
          ALLY: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { role: "enemy" } }])

      expect(resultStates).toEqual([])
    })
  })
})
