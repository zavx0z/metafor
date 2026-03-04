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

describe("Monad — Array переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (changes: BraneStateChange[]) => {
      for (const change of changes) {
        // Игнорируем событие рождения: undefined -> first state
        if (change.oldState === undefined) continue
        resultStates.push(change.newState)
      }
    }
  }

  describe("include (содержит элемент)", () => {
    it("должен выполнить переход при tags includes 'urgent'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: [] },
        superposition: {
          IDLE: { URGENT: { tags: { include: "urgent" } } },
          URGENT: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()

      // tags=[] → не переходит
      await updateMonads([{ uuid: monadUuid, fields: { tags: [] } }])
      expect(resultStates).toEqual([])

      // tags=['urgent'] → переходит
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["urgent", "important"] } }])
      expect(resultStates).toEqual(["URGENT"])
    })

    it("должен выполнить переход при numbers includes 5", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { numbers: { type: "array<number>" } },
        values: { numbers: [] },
        superposition: {
          IDLE: { FOUND: { numbers: { include: 5 } } },
          FOUND: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { numbers: [1, 5, 10] } }])

      expect(resultStates).toEqual(["FOUND"])
    })

    it("не должен выполнить переход при numbers not includes 5", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { numbers: { type: "array<number>" } },
        values: { numbers: [] },
        superposition: {
          IDLE: { FOUND: { numbers: { include: 5 } } },
          FOUND: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { numbers: [1, 2, 3] } }])

      expect(resultStates).toEqual([])
    })
  })

  describe("notInclude (не содержит элемент)", () => {
    it("должен выполнить переход при tags notInclude 'blocked'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: [] },
        superposition: {
          CHECKING: { ALLOWED: { tags: { notInclude: "blocked" } } },
          ALLOWED: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()

      // tags=['active'] → переходит (не содержит 'blocked')
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["active"] } }])
      expect(resultStates).toEqual(["ALLOWED"])
    })

    it("не должен выполнить переход при tags includes 'blocked'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: ["blocked"] },
        superposition: {
          CHECKING: { ALLOWED: { tags: { notInclude: "blocked" } } },
          ALLOWED: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()

      expect(resultStates).toEqual([])
    })
  })

  describe("length (длина массива)", () => {
    it("должен выполнить переход при tags.length === 3", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: [] },
        superposition: {
          IDLE: { MANY: { tags: { length: { eq: 3 } } } },
          MANY: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()

      // tags.length=2 → не переходит
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["a", "b"] } }])
      expect(resultStates).toEqual([])

      // tags.length=3 → переходит
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["a", "b", "c"] } }])
      expect(resultStates).toEqual(["MANY"])
    })

    it("должен выполнить переход при tags.length > 2", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: [] },
        superposition: {
          IDLE: { MANY: { tags: { length: { gt: 2 } } } },
          MANY: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["a", "b", "c", "d"] } }])

      expect(resultStates).toEqual(["MANY"])
    })

    it("должен выполнить переход при tags.length >= 2", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: [] },
        superposition: {
          IDLE: { SOME: { tags: { length: { gte: 2 } } } },
          SOME: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["a", "b"] } }])

      expect(resultStates).toEqual(["SOME"])
    })

    it("должен выполнить переход при tags.length < 3", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: [] },
        superposition: {
          IDLE: { FEW: { tags: { length: { lt: 3 } } } },
          FEW: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["a"] } }])

      expect(resultStates).toEqual(["FEW"])
    })

    it("должен выполнить переход при tags.length <= 2", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: [] },
        superposition: {
          IDLE: { FEW: { tags: { length: { lte: 2 } } } },
          FEW: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["a", "b"] } }])

      expect(resultStates).toEqual(["FEW"])
    })
  })

  describe("isEmpty (пустой массив)", () => {
    it("должен выполнить переход при tags.isEmpty === true", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: ["a"] },
        superposition: {
          HAS_ITEMS: { EMPTY: { tags: { isEmpty: true } } },
          EMPTY: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { tags: [] } }])

      expect(resultStates).toEqual(["EMPTY"])
    })

    it("должен выполнить переход при tags.isEmpty === false", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: [] },
        superposition: {
          EMPTY: { HAS_ITEMS: { tags: { isEmpty: false } } },
          HAS_ITEMS: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["a"] } }])

      expect(resultStates).toEqual(["HAS_ITEMS"])
    })
  })

  describe("Комбинированные условия с array", () => {
    it("должен выполнить переход при tags.length > 2 И tags includes 'urgent'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const uuid = crypto.randomUUID()
      const monadUuid = createMonad({
        uuid,
        fields: { tags: { type: "array<string>" } },
        values: { tags: [] },
        superposition: {
          IDLE: { CRITICAL: {
            tags: { length: { gt: 2 }, include: "urgent" },
          } },
          CRITICAL: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(monadUuid)

      await updateBoundary()

      // tags.length=3, но нет 'urgent' → не переходит
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["a", "b", "c"] } }])
      expect(resultStates).toEqual([])

      // tags.length=3 И есть 'urgent' → переходит
      await updateMonads([{ uuid: monadUuid, fields: { tags: ["urgent", "b", "c"] } }])
      expect(resultStates).toEqual(["CRITICAL"])
    })
  })
})
