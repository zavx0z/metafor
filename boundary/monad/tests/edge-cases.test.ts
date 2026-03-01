import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  updateMonads,
  updateBoundary,
  onStateChange,
  _resetState,
} from "../monad"
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
    return (_id: string, _old: string, current: string) => {
      resultStates.push(current)
    }
  }

  describe("Exact значения (gte/lte)", () => {
    it("должен выполнить переход при hp === 50 (gte на границе)", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 30 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gte: 50 } } },
          PATROL: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { hp: 50 } }])

      expect(resultStates).toEqual(["PATROL"])
    })

    it("должен выполнить переход при hp === 0 (lte на границе)", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "ALIVE",
        superposition: {
          ALIVE: { DEAD: { hp: { lte: 0 } } },
          DEAD: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { hp: 0 } }])

      expect(resultStates).toEqual(["DEAD"])
    })
  })

  describe("Отрицательные числа", () => {
    it("должен выполнить переход при temperature < 0", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { temperature: { type: "number" } },
        params: { temperature: 20 },
        state: "NORMAL",
        superposition: {
          NORMAL: { COLD: { temperature: { lt: 0 } } },
          COLD: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { temperature: -10 } }])

      expect(resultStates).toEqual(["COLD"])
    })

    it("должен выполнить переход при temperature <= -273", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { temperature: { type: "number" } },
        params: { temperature: 0 },
        state: "NORMAL",
        superposition: {
          NORMAL: { ABSOLUTE_ZERO: { temperature: { lte: -273 } } },
          ABSOLUTE_ZERO: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { temperature: -273 } }])

      expect(resultStates).toEqual(["ABSOLUTE_ZERO"])
    })
  })

  describe("Дробные числа", () => {
    it("должен выполнить переход при health < 50.5", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { health: { type: "number" } },
        params: { health: 100 },
        state: "HEALTHY",
        superposition: {
          HEALTHY: { WEAK: { health: { lt: 50.5 } } },
          WEAK: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { health: 50.4 } }])

      expect(resultStates).toEqual(["WEAK"])
    })

    it("должен выполнить переход при health >= 99.9", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { health: { type: "number" } },
        params: { health: 50 },
        state: "NORMAL",
        superposition: {
          NORMAL: { CRITICAL: { health: { gte: 99.9 } } },
          CRITICAL: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { health: 99.9 } }])

      expect(resultStates).toEqual(["CRITICAL"])
    })
  })

  describe("Пустая строка", () => {
    it("должен выполнить переход при command === ''", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { command: { type: "string" } },
        params: { command: "attack" },
        state: "ACTIVE",
        superposition: {
          ACTIVE: { IDLE: { command: { eq: "" } } },
          IDLE: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonads([{ id: id, fields: { command: "" } }])

      expect(resultStates).toEqual(["IDLE"])
    })

    it("должен выполнить переход при message notIn ['', 'pending']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { message: { type: "string" } },
        params: { message: "" },
        state: "WAITING",
        superposition: {
          WAITING: { PROCESSING: { message: { notIn: ["", "pending"] } } },
          PROCESSING: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // message="" → не переходит
      await updateMonads([{ id: id, fields: { message: "" } }])
      expect(resultStates).toEqual([])

      // message="ready" → переходит
      await updateMonads([{ id: id, fields: { message: "ready" } }])
      expect(resultStates).toEqual(["PROCESSING"])
    })
  })

  describe("Терминальное состояние (null переходов)", () => {
    it("должен остаться в терминальном состоянии без исходящих переходов", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "IDLE",
        superposition: {
          IDLE: { DEAD: { hp: { lte: 0 } } },
          DEAD: null, // Терминальное состояние
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // Переход в DEAD
      await updateMonads([{ id: id, fields: { hp: 0 } }])
      expect(resultStates).toEqual(["DEAD"])

      // Попытка перехода из DEAD (должен остаться в DEAD)
      await updateMonads([{ id: id, fields: { hp: 100 } }])
      expect(resultStates).toEqual(["DEAD"])
    })

    it("должен обработать множественные терминальные состояния", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 50 },
        state: "IDLE",
        superposition: {
          IDLE: {
            VICTORY: { hp: { gte: 80 } },
            DEAD: { hp: { lte: 0 } },
          },
          VICTORY: null, // Терминальное
          DEAD: null,    // Терминальное
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // Переход в VICTORY
      await updateMonads([{ id: id, fields: { hp: 100 } }])
      expect(resultStates).toEqual(["VICTORY"])

      // Остаётся в VICTORY
      await updateMonads([{ id: id, fields: { hp: 0 } }])
      expect(resultStates).toEqual(["VICTORY"])
    })
  })
})
