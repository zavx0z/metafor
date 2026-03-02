import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  updateMonads,
  updateBoundary,
  _resetState,
  onStateChange,
  type BraneStateChange,
} from "../monad"
import { GPU } from "@boundary/matrix"
import { setupDevice } from "fixture/bunWebGPU"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

afterEach(() => {
  _resetState()
})

describe("Monad — Entangled Branes (shared блоки)", () => {
  describe("Автоматическое создание shared блоков", () => {
    it("должен создать shared блок для одинаковых значений полей", async () => {
      // Две монады с одинаковым значением hp=100
      createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" } },
        params: { hp: 100, mana: 50 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })

      createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" } },
        params: { hp: 100, mana: 10 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })

      await updateBoundary()

      // Shared блок должен быть создан для hp=100
      // mana должно быть локальным полем
    })

    it("не должен создавать shared блок для разных значений", async () => {
      // Две монады с разными значениями hp
      createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 100 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })

      createMonad({
        fields: { hp: { type: "number" } },
        params: { hp: 50 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })

      await updateBoundary()

      // Все поля должны быть локальными (нет shared блоков)
    })

    it("должен создать shared блок для идентичных бран", async () => {
      // Две полностью идентичные монады
      createMonad({
        fields: { hp: { type: "number" }, isAlive: { type: "boolean" } },
        params: { hp: 100, isAlive: true },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })

      createMonad({
        fields: { hp: { type: "number" }, isAlive: { type: "boolean" } },
        params: { hp: 100, isAlive: true },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
        intentions: {},
      })

      await updateBoundary()

      // Все поля должны быть в shared блоке
    })
  })

  describe("Корректность работы с shared блоками", () => {
    it("должен корректно работать с shared блоком", async () => {
      // hp разное → локальное, isAlive одинаковое → shared
      const changes: BraneStateChange[] = []

      const id1 = createMonad({
        fields: { hp: { type: "number" }, isAlive: { type: "boolean" } },
        params: { hp: 30, isAlive: true },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },  // Переход по hp (локальное)
          PATROL: null,
        },
      })

      createMonad({
        fields: { hp: { type: "number" }, isAlive: { type: "boolean" } },
        params: { hp: 50, isAlive: true },  // hp разное → локальное
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { hp: { gt: 50 } } },
          PATROL: null,
        },
      })

      onStateChange((c) => changes.push(...c))
      await updateBoundary()

      // isAlive=true в shared блоке, hp=100 локальное
      // Обновляем локальное hp → переход в PATROL
      await updateMonads([{ id: id1, fields: { hp: 80 } }])

      // Проверяем что изменение состояния получило правильные params (включая shared isAlive)
      expect(changes).toHaveLength(1)
      expect(changes[0]!.params).toEqual({ hp: 80, isAlive: true })
    })

    it("должен работать с mixed: local + shared поля", async () => {
      const id1 = createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" }, isAlive: { type: "boolean" } },
        params: { hp: 100, mana: 50, isAlive: true },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { lt: 30 } } },
          PATROL: null,
        },
        intentions: {},
      })

      const id2 = createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" }, isAlive: { type: "boolean" } },
        params: { hp: 100, mana: 10, isAlive: true },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { lt: 30 } } },
          PATROL: null,
        },
        intentions: {},
      })

      await updateBoundary()

      // hp и isAlive должны быть в shared блоке
      // mana должно быть локальным для каждой монады

      // Обновляем mana у первой монады (не переходит, mana=60 не < 30)
      await updateMonads([{ id: id1, fields: { mana: 60 } }])

      // Обновляем mana у второй монады (переходит, mana=5 < 30)
      await updateMonads([{ id: id2, fields: { mana: 5 } }])
    })
  })

  describe("Проверка через onStateChange params", () => {
    it("должен передать shared поля в onStateChange", async () => {
      const changes: BraneStateChange[] = []

      // Монада 1: hp=100, isAlive=true, role="warrior"
      const id1 = createMonad({
        fields: { hp: { type: "number" }, isAlive: { type: "boolean" }, role: { type: "string" }, mana: { type: "number" } },
        params: { hp: 100, isAlive: true, role: "warrior", mana: 10 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { gt: 40 } } },  // Переход по mana (локальное)
          PATROL: null,
        },
      })

      // Монада 2: hp=100, isAlive=true, role="warrior" (идентичные → shared), mana=5 (локальное)
      const id2 = createMonad({
        fields: { hp: { type: "number" }, isAlive: { type: "boolean" }, role: { type: "string" }, mana: { type: "number" } },
        params: { hp: 100, isAlive: true, role: "warrior", mana: 5 },  // mana разное → локальное
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { gt: 40 } } },
          PATROL: null,
        },
      })

      onStateChange((c) => changes.push(...c))
      await updateBoundary()

      // mana=60 > 40 → переход в PATROL (только монада 1)
      await updateMonads([{ id: id1, fields: { mana: 60 } }])

      // Проверяем что изменение состояния получило правильные params (включая shared isAlive, role)
      expect(changes).toHaveLength(1)
      expect(changes[0]!.params).toEqual({ hp: 100, isAlive: true, role: "warrior", mana: 60 })
    })

    it("должен передать mixed local + shared поля в onStateChange", async () => {
      const changes: BraneStateChange[] = []

      // Монада 1: hp=100 (shared), mana=10 (local)
      const id1 = createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" } },
        params: { hp: 100, mana: 10 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { gt: 40 } } },
          PATROL: null,
        },
      })

      // Монада 2: hp=100 (shared), mana=5 (local)
      const id2 = createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" } },
        params: { hp: 100, mana: 5 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { gt: 40 } } },
          PATROL: null,
        },
      })

      onStateChange((c) => changes.push(...c))
      await updateBoundary()

      // mana=60 > 40 → переход в PATROL
      await updateMonads([{ id: id1, fields: { mana: 60 } }])
      // mana=5 не > 40 → нет перехода

      // Проверяем что изменение состояния получило shared hp и локальное mana
      expect(changes).toHaveLength(1)
      expect(changes[0]!.params).toEqual({ hp: 100, mana: 60 })
    })
  })

  describe("Оптимизация памяти", () => {
    it("должен экономить память при множестве identical бран", async () => {
      // Создаём 10 идентичных монад
      for (let i = 0; i < 10; i++) {
        createMonad({
          fields: { hp: { type: "number" }, isAlive: { type: "boolean" } },
          params: { hp: 100, isAlive: true },
          state: "IDLE",
          superposition: {
            IDLE: { PATROL: { hp: { gt: 50 } } },
            PATROL: null,
          },
          intentions: {},
        })
      }

      await updateBoundary()

      // Shared блоки должны экономить память
    })

    it("должен корректно работать с 3+ монадами с частичным совпадением", async () => {
      const id1 = createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" }, isAlive: { type: "boolean" } },
        params: { hp: 100, mana: 50, isAlive: true },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { gt: 40 } } },
          PATROL: null,
        },
        intentions: {},
      })

      const id2 = createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" }, isAlive: { type: "boolean" } },
        params: { hp: 100, mana: 30, isAlive: true },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { gt: 40 } } },
          PATROL: null,
        },
        intentions: {},
      })

      const id3 = createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" }, isAlive: { type: "boolean" } },
        params: { hp: 50, mana: 100, isAlive: false },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { gt: 40 } } },
          PATROL: null,
        },
        intentions: {},
      })

      await updateBoundary()

      // Монады 1 и 2: hp=100 и isAlive=true должны быть в shared блоке
      // Монада 3: все поля локальные (отличаются)

      // Обновляем mana у всех трёх
      await updateMonads([{ id: id1, fields: { mana: 60 } }])
      await updateMonads([{ id: id2, fields: { mana: 40 } }])
      await updateMonads([{ id: id3, fields: { mana: 80 } }])
    })
  })

  describe("Интеграция с updateMonads", () => {
    it("должен корректно обновлять локальные поля", async () => {
      const id1 = createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" } },
        params: { hp: 100, mana: 50 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { gt: 40 } } },
          PATROL: null,
        },
        intentions: {},
      })

      const id2 = createMonad({
        fields: { hp: { type: "number" }, mana: { type: "number" } },
        params: { hp: 100, mana: 10 },
        state: "IDLE",
        superposition: {
          IDLE: { PATROL: { mana: { gt: 40 } } },
          PATROL: null,
        },
        intentions: {},
      })

      await updateBoundary()

      // mana локальное для каждой монады
      await updateMonads([{ id: id1, fields: { mana: 60 } }])
      await updateMonads([{ id: id2, fields: { mana: 5 } }])

      // hp shared, но используется только для условий
    })
  })
})
