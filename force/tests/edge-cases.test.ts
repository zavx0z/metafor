import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  updateMonads,
  updateBoundary,
  onStateChange,
  _resetState,
  type BraneStateChange,
} from "../index"
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

describe("Monad — Граничные случаи", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (changes: BraneStateChange[]) => {
      for (const change of changes) {
        if (change.oldState === undefined) {
          continue
        }
        resultStates.push(change.newState)
      }
    }
  }

  describe("Exact значения (gte/lte)", () => {
    it("должен выполнить переход при hp === 50 (gte на границе)", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 30 },
        superposition: {
          IDLE: { PATROL: { hp: { gte: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { hp: 50 } }])

      expect(resultStates).toEqual(["PATROL"])
    })

    it("должен выполнить переход при hp === 0 (lte на границе)", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 100 },
        superposition: {
          ALIVE: { DEAD: { hp: { lte: 0 } } },
          DEAD: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { hp: 0 } }])

      expect(resultStates).toEqual(["DEAD"])
    })
  })

  describe("Отрицательные числа", () => {
    it("должен выполнить переход при temperature < 0", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { temperature: { type: "number" } },
        values: { temperature: 20 },
        superposition: {
          NORMAL: { COLD: { temperature: { lt: 0 } } },
          COLD: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { temperature: -10 } }])

      expect(resultStates).toEqual(["COLD"])
    })

    it("должен выполнить переход при temperature <= -273", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { temperature: { type: "number" } },
        values: { temperature: 0 },
        superposition: {
          NORMAL: { ABSOLUTE_ZERO: { temperature: { lte: -273 } } },
          ABSOLUTE_ZERO: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { temperature: -273 } }])

      expect(resultStates).toEqual(["ABSOLUTE_ZERO"])
    })
  })

  describe("Дробные числа", () => {
    it("должен выполнить переход при health < 50.5", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { health: { type: "number" } },
        values: { health: 100 },
        superposition: {
          HEALTHY: { WEAK: { health: { lt: 50.5 } } },
          WEAK: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { health: 50.4 } }])

      expect(resultStates).toEqual(["WEAK"])
    })

    it("должен выполнить переход при health >= 99.9", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { health: { type: "number" } },
        values: { health: 50 },
        superposition: {
          NORMAL: { CRITICAL: { health: { gte: 99.9 } } },
          CRITICAL: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { health: 99.9 } }])

      expect(resultStates).toEqual(["CRITICAL"])
    })
  })

  describe("Пустая строка", () => {
    it("должен выполнить переход при command === ''", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { command: { type: "string" } },
        values: { command: "attack" },
        superposition: {
          ACTIVE: { IDLE: { command: { eq: "" } } },
          IDLE: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { command: "" } }])

      expect(resultStates).toEqual(["IDLE"])
    })

    it("должен выполнить переход при message notIn ['', 'pending']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { message: { type: "string" } },
        values: { message: "" },
        superposition: {
          WAITING: { PROCESSING: { message: { notIn: ["", "pending"] } } },
          PROCESSING: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()

      // message="" → не переходит
      await updateMonads([{ uuid: monadUuid, fields: { message: "" } }])
      expect(resultStates).toEqual([])

      // message="ready" → переходит
      await updateMonads([{ uuid: monadUuid, fields: { message: "ready" } }])
      expect(resultStates).toEqual(["PROCESSING"])
    })
  })

  describe("Терминальное состояние (null переходов)", () => {
    it("должен остаться в терминальном состоянии без исходящих переходов", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 100 },
        superposition: {
          IDLE: { DEAD: { hp: { lte: 0 } } },
          DEAD: null, // Терминальное состояние
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()

      // Переход в DEAD
      await updateMonads([{ uuid: monadUuid, fields: { hp: 0 } }])
      expect(resultStates).toEqual(["DEAD"])

      // Попытка перехода из DEAD (должен остаться в DEAD)
      await updateMonads([{ uuid: monadUuid, fields: { hp: 100 } }])
      expect(resultStates).toEqual(["DEAD"])
    })

    it("должен обработать множественные терминальные состояния", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { hp: { type: "number" } },
        values: { hp: 50 },
        superposition: {
          IDLE: {
            VICTORY: { hp: { gte: 80 } },
            DEAD: { hp: { lte: 0 } },
          },
          VICTORY: null, // Терминальное
          DEAD: null,    // Терминальное
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()

      // Переход в VICTORY
      await updateMonads([{ uuid: monadUuid, fields: { hp: 100 } }])
      expect(resultStates).toEqual(["VICTORY"])

      // Остаётся в VICTORY
      await updateMonads([{ uuid: monadUuid, fields: { hp: 0 } }])
      expect(resultStates).toEqual(["VICTORY"])
    })
  })
})
