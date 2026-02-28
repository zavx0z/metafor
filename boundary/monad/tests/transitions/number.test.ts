import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  updateMonad,
  updateBoundary,
  onStateChange,
  _resetState,
} from "../../src/monad"
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

describe("Monad — Числовые переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (_id: string, _old: string, current: string) => {
      resultStates.push(current)
    }
  }

  describe("gt (больше)", () => {
    it("должен выполнить переход при hp > 50", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 30 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { hp: 80 })

      expect(resultStates).toEqual(["PATROL"])
    })

    it("не должен выполнить переход при hp <= 50", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 30 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { hp: 50 })

      expect(resultStates).toEqual([])
    })
  })

  describe("gte (больше или равно)", () => {
    it("должен выполнить переход при hp >= 50", async () => {
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
      await updateMonad(id, { hp: 50 })

      expect(resultStates).toEqual(["PATROL"])
    })

    it("не должен выполнить переход при hp < 50", async () => {
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
      await updateMonad(id, { hp: 49 })

      expect(resultStates).toEqual([])
    })
  })

  describe("lt (меньше)", () => {
    it("должен выполнить переход при hp < 30", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "IDLE",
        superposition: {
          IDLE: { WEAK: { hp: { lt: 30 } } },
          WEAK: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { hp: 20 })

      expect(resultStates).toEqual(["WEAK"])
    })

    it("не должен выполнить переход при hp >= 30", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "IDLE",
        superposition: {
          IDLE: { WEAK: { hp: { lt: 30 } } },
          WEAK: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { hp: 30 })

      expect(resultStates).toEqual([])
    })
  })

  describe("lte (меньше или равно)", () => {
    it("должен выполнить переход при hp <= 30", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "IDLE",
        superposition: {
          IDLE: { WEAK: { hp: { lte: 30 } } },
          WEAK: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { hp: 30 })

      expect(resultStates).toEqual(["WEAK"])
    })

    it("не должен выполнить переход при hp > 30", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "IDLE",
        superposition: {
          IDLE: { WEAK: { hp: { lte: 30 } } },
          WEAK: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { hp: 31 })

      expect(resultStates).toEqual([])
    })
  })

  describe("eq (равно)", () => {
    it("должен выполнить переход при hp === 50", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "IDLE",
        superposition: {
          IDLE: { CRITICAL: { hp: { eq: 50 } } },
          CRITICAL: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { hp: 50 })

      expect(resultStates).toEqual(["CRITICAL"])
    })

    it("не должен выполнить переход при hp !== 50", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "IDLE",
        superposition: {
          IDLE: { CRITICAL: { hp: { eq: 50 } } },
          CRITICAL: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { hp: 51 })

      expect(resultStates).toEqual([])
    })
  })

  describe("neq (не равно)", () => {
    it("должен выполнить переход при hp !== 100", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "IDLE",
        superposition: {
          IDLE: { CHANGED: { hp: { neq: 100 } } },
          CHANGED: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { hp: 80 })

      expect(resultStates).toEqual(["CHANGED"])
    })

    it("не должен выполнить переход при hp === 100", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "IDLE",
        superposition: {
          IDLE: { CHANGED: { hp: { neq: 100 } } },
          CHANGED: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { hp: 100 })

      expect(resultStates).toEqual([])
    })
  })
})
