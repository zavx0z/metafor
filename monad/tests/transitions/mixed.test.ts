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

describe("Monad — Смешанные переходы", () => {
  const createStateChangeHandler = (resultStates: string[]) => {
    return (changes: BraneStateChange[]) => {
      for (const change of changes) {
        if (change.oldState === undefined) continue
        resultStates.push(change.newState)
      }
    }
  }

  describe("number + boolean", () => {
    it("должен выполнить переход при hp > 50 И isAlive === true", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" }, isAlive: { type: "boolean" } },
        values: { hp: 30, isAlive: true },
        superposition: {
          IDLE: {
            COMBAT: {
              hp: { gt: 50 },
              isAlive: true,
            },
          },
          COMBAT: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // hp=100>50, isAlive=false → не переходит
      await updateMonads([{ id: id, fields: { hp: 100, isAlive: false } }])
      expect(resultStates).toEqual([])

      // hp=100>50, isAlive=true → переходит
      await updateMonads([{ id: id, fields: { isAlive: true } }])
      expect(resultStates).toEqual(["COMBAT"])
    })

    it("должен выполнить переход при hp <= 0 ИЛИ isAlive === false", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" }, isAlive: { type: "boolean" } },
        values: { hp: 100, isAlive: true },
        superposition: {
          ALIVE: {
            DEAD: { hp: { lte: 0 } },
            UNCONSCIOUS: { isAlive: { eq: false } },
          },
          DEAD: null,
          UNCONSCIOUS: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // isAlive=false → UNCONSCIOUS (первый переход)
      await updateMonads([{ id: id, fields: { isAlive: false } }])
      expect(resultStates).toEqual(["UNCONSCIOUS"])
    })
  })

  describe("number + string", () => {
    it("должен выполнить переход при hp > 50 И command === 'attack'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" }, command: { type: "string" } },
        values: { hp: 100, command: "" },
        superposition: {
          IDLE: {
            ATTACK: {
              hp: { gt: 50 },
              command: { eq: "attack" },
            },
          },
          ATTACK: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // hp=100>50, command="defend" → не переходит
      await updateMonads([{ id: id, fields: { command: "defend" } }])
      expect(resultStates).toEqual([])

      // hp=100>50, command="attack" → переходит
      await updateMonads([{ id: id, fields: { command: "attack" } }])
      expect(resultStates).toEqual(["ATTACK"])
    })

    it("должен выполнить переход при hp > 80 И role in ['warrior', 'mage']", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { hp: { type: "number" }, role: { type: "string" } },
        values: { hp: 50, role: "" },
        superposition: {
          IDLE: {
            READY: {
              hp: { gt: 80 },
              role: { in: ["warrior", "mage"] },
            },
          },
          READY: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // hp=90>80, role="healer" → не переходит
      await updateMonads([{ id: id, fields: { hp: 90, role: "healer" } }])
      expect(resultStates).toEqual([])

      // hp=90>80, role="mage" → переходит
      await updateMonads([{ id: id, fields: { role: "mage" } }])
      expect(resultStates).toEqual(["READY"])
    })
  })

  describe("boolean + string", () => {
    it("должен выполнить переход при isConnected === true И status === 'ready'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: { isConnected: { type: "boolean" }, status: { type: "string" } },
        values: { isConnected: false, status: "" },
        superposition: {
          DISCONNECTED: {
            CONNECTED: {
              isConnected: true,
              status: { eq: "ready" },
            },
          },
          CONNECTED: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // isConnected=true, status="pending" → не переходит
      await updateMonads([{ id: id, fields: { isConnected: true, status: "pending" } }])
      expect(resultStates).toEqual([])

      // isConnected=true, status="ready" → переходит
      await updateMonads([{ id: id, fields: { status: "ready" } }])
      expect(resultStates).toEqual(["CONNECTED"])
    })
  })

  describe("number + boolean + string", () => {
    it("должен выполнить переход при hp > 50 И isAlive === true И command === 'fight'", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: {
          hp: { type: "number" },
          isAlive: { type: "boolean" },
          command: { type: "string" },
        },
        values: { hp: 100, isAlive: true, command: "" },
        superposition: {
          IDLE: {
            COMBAT: {
              hp: { gt: 50 },
              isAlive: true,
              command: { eq: "fight" },
            },
          },
          COMBAT: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // hp=100>50, isAlive=true, command="" → не переходит
      expect(resultStates).toEqual([])

      // hp=100>50, isAlive=true, command="fight" → переходит
      await updateMonads([{ id: id, fields: { command: "fight" } }])
      expect(resultStates).toEqual(["COMBAT"])
    })

    it("должен проверить приоритет переходов с разными типами", async () => {
      const resultStates: string[] = []
      onStateChange(createStateChangeHandler(resultStates))

      const id = createMonad({
        fields: {
          hp: { type: "number" },
          isAlive: { type: "boolean" },
          status: { type: "string" },
        },
        values: { hp: 100, isAlive: true, status: "normal" },
        superposition: {
          IDLE: {
            DEAD: { hp: { lte: 0 } },           // Приоритет 1
            UNCONSCIOUS: { isAlive: { eq: false } }, // Приоритет 2
            CRITICAL: { status: { eq: "critical" } }, // Приоритет 3
          },
          DEAD: null,
          UNCONSCIOUS: null,
          CRITICAL: null,
        },
        intentions: {},
      })
      _createdMonadIds.push(id)

      await updateBoundary()

      // hp=0<=0 → DEAD (первый переход)
      await updateMonads([{ id: id, fields: { hp: 0 } }])
      expect(resultStates).toEqual(["DEAD"])
    })
  })
})
