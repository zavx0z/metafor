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

describe("Monad — Array переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (_id: string, _old: string, current: string) => {
      resultStates.push(current)
    }
  }

  describe("include (содержит элемент)", () => {
    it("должен выполнить переход при tags includes 'urgent'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: [] },
        state: "IDLE",
        superposition: {
          IDLE: { URGENT: { tags: { include: "urgent" } } },
          URGENT: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // tags=[] → не переходит
      await updateMonad(id, { tags: [] })
      expect(resultStates).toEqual([])

      // tags=['urgent'] → переходит
      await updateMonad(id, { tags: ["urgent", "important"] })
      expect(resultStates).toEqual(["URGENT"])
    })

    it("должен выполнить переход при numbers includes 5", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { numbers: { type: "array<number>" } },
        params: { numbers: [] },
        state: "IDLE",
        superposition: {
          IDLE: { FOUND: { numbers: { include: 5 } } },
          FOUND: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { numbers: [1, 5, 10] })

      expect(resultStates).toEqual(["FOUND"])
    })

    it("не должен выполнить переход при numbers not includes 5", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { numbers: { type: "array<number>" } },
        params: { numbers: [] },
        state: "IDLE",
        superposition: {
          IDLE: { FOUND: { numbers: { include: 5 } } },
          FOUND: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { numbers: [1, 2, 3] })

      expect(resultStates).toEqual([])
    })
  })

  describe("notInclude (не содержит элемент)", () => {
    it("должен выполнить переход при tags notInclude 'blocked'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: [] },
        state: "CHECKING",
        superposition: {
          CHECKING: { ALLOWED: { tags: { notInclude: "blocked" } } },
          ALLOWED: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // tags=['active'] → переходит (не содержит 'blocked')
      await updateMonad(id, { tags: ["active"] })
      expect(resultStates).toEqual(["ALLOWED"])
    })

    it("не должен выполнить переход при tags includes 'blocked'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: ["blocked"] },
        state: "CHECKING",
        superposition: {
          CHECKING: { ALLOWED: { tags: { notInclude: "blocked" } } },
          ALLOWED: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      expect(resultStates).toEqual([])
    })
  })

  describe("length (длина массива)", () => {
    it("должен выполнить переход при tags.length === 3", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: [] },
        state: "IDLE",
        superposition: {
          IDLE: { MANY: { tags: { length: { eq: 3 } } } },
          MANY: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // tags.length=2 → не переходит
      await updateMonad(id, { tags: ["a", "b"] })
      expect(resultStates).toEqual([])

      // tags.length=3 → переходит
      await updateMonad(id, { tags: ["a", "b", "c"] })
      expect(resultStates).toEqual(["MANY"])
    })

    it("должен выполнить переход при tags.length > 2", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: [] },
        state: "IDLE",
        superposition: {
          IDLE: { MANY: { tags: { length: { gt: 2 } } } },
          MANY: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { tags: ["a", "b", "c", "d"] })

      expect(resultStates).toEqual(["MANY"])
    })

    it("должен выполнить переход при tags.length >= 2", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: [] },
        state: "IDLE",
        superposition: {
          IDLE: { SOME: { tags: { length: { gte: 2 } } } },
          SOME: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { tags: ["a", "b"] })

      expect(resultStates).toEqual(["SOME"])
    })

    it("должен выполнить переход при tags.length < 3", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: [] },
        state: "IDLE",
        superposition: {
          IDLE: { FEW: { tags: { length: { lt: 3 } } } },
          FEW: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { tags: ["a"] })

      expect(resultStates).toEqual(["FEW"])
    })

    it("должен выполнить переход при tags.length <= 2", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: [] },
        state: "IDLE",
        superposition: {
          IDLE: { FEW: { tags: { length: { lte: 2 } } } },
          FEW: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { tags: ["a", "b"] })

      expect(resultStates).toEqual(["FEW"])
    })
  })

  describe("isEmpty (пустой массив)", () => {
    it("должен выполнить переход при tags.isEmpty === true", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: ["a"] },
        state: "HAS_ITEMS",
        superposition: {
          HAS_ITEMS: { EMPTY: { tags: { isEmpty: true } } },
          EMPTY: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { tags: [] })

      expect(resultStates).toEqual(["EMPTY"])
    })

    it("должен выполнить переход при tags.isEmpty === false", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: [] },
        state: "EMPTY",
        superposition: {
          EMPTY: { HAS_ITEMS: { tags: { isEmpty: false } } },
          HAS_ITEMS: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()
      await updateMonad(id, { tags: ["a"] })

      expect(resultStates).toEqual(["HAS_ITEMS"])
    })
  })

  describe("Комбинированные условия с array", () => {
    it("должен выполнить переход при tags.length > 2 И tags includes 'urgent'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { tags: { type: "array<string>" } },
        params: { tags: [] },
        state: "IDLE",
        superposition: {
          IDLE: { CRITICAL: {
            tags: { length: { gt: 2 }, include: "urgent" },
          } },
          CRITICAL: null,
        },
        actions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // tags.length=3, но нет 'urgent' → не переходит
      await updateMonad(id, { tags: ["a", "b", "c"] })
      expect(resultStates).toEqual([])

      // tags.length=3 И есть 'urgent' → переходит
      await updateMonad(id, { tags: ["urgent", "b", "c"] })
      expect(resultStates).toEqual(["CRITICAL"])
    })
  })
})
