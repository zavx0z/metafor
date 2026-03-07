import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createActor,
  updateActors,
  updateBoundary,
  onStateChange,
  force$,
  type BraneStateChange,
} from "../../index"
import { GPU } from "@boundary/matrix"
import { setupDevice } from "fixture/bunWebGPU"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

const _createdActorIds: string[] = []

afterEach(() => {
  force$.reset()
  _createdActorIds.length = 0
})

describe("Monad — Числовые переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (changes: BraneStateChange[]) => {
      for (const change of changes) {
        // Игнорируем событие рождения монады: undefined -> initial state
        if (change.oldState === undefined) continue
        resultStates.push(change.newState)
      }
    }
  }

  describe("gt (больше)", () => {
    it("должен выполнить переход при hp > 50", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 30 },
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 80 } }])

      expect(resultStates).toEqual(["PATROL"])
    })

    it("не должен выполнить переход при hp <= 50", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 30 },
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 50 } }])

      expect(resultStates).toEqual([])
    })
  })

  describe("gte (больше или равно)", () => {
    it("должен выполнить переход при hp >= 50", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 30 },
        superposition: {
          IDLE: { PATROL: { hp: { gte: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 50 } }])

      expect(resultStates).toEqual(["PATROL"])
    })

    it("не должен выполнить переход при hp < 50", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 30 },
        superposition: {
          IDLE: { PATROL: { hp: { gte: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 49 } }])

      expect(resultStates).toEqual([])
    })
  })

  describe("lt (меньше)", () => {
    it("должен выполнить переход при hp < 30", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 100 },
        superposition: {
          IDLE: { WEAK: { hp: { lt: 30 } } },
          WEAK: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 20 } }])

      expect(resultStates).toEqual(["WEAK"])
    })

    it("не должен выполнить переход при hp >= 30", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 100 },
        superposition: {
          IDLE: { WEAK: { hp: { lt: 30 } } },
          WEAK: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 30 } }])

      expect(resultStates).toEqual([])
    })
  })

  describe("lte (меньше или равно)", () => {
    it("должен выполнить переход при hp <= 30", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 100 },
        superposition: {
          IDLE: { WEAK: { hp: { lte: 30 } } },
          WEAK: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 30 } }])

      expect(resultStates).toEqual(["WEAK"])
    })

    it("не должен выполнить переход при hp > 30", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 100 },
        superposition: {
          IDLE: { WEAK: { hp: { lte: 30 } } },
          WEAK: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 31 } }])

      expect(resultStates).toEqual([])
    })
  })

  describe("eq (равно)", () => {
    it("должен выполнить переход при hp === 50", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 100 },
        superposition: {
          IDLE: { CRITICAL: { hp: { eq: 50 } } },
          CRITICAL: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 50 } }])

      expect(resultStates).toEqual(["CRITICAL"])
    })

    it("не должен выполнить переход при hp !== 50", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 100 },
        superposition: {
          IDLE: { CRITICAL: { hp: { eq: 50 } } },
          CRITICAL: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 51 } }])

      expect(resultStates).toEqual([])
    })
  })

  describe("neq (не равно)", () => {
    it("должен выполнить переход при hp !== 100", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 100 },
        superposition: {
          IDLE: { CHANGED: { hp: { neq: 100 } } },
          CHANGED: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 80 } }])

      expect(resultStates).toEqual(["CHANGED"])
    })

    it("не должен выполнить переход при hp === 100", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createActor({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 100 },
        superposition: {
          IDLE: { CHANGED: { hp: { neq: 100 } } },
          CHANGED: null,
        },
        intentions: {},
      })
      _createdActorIds.push(monadUuid)

      await updateBoundary()
      await updateActors([{ uuid: monadUuid, fields: { hp: 100 } }])

      expect(resultStates).toEqual([])
    })
  })
})
