import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLiteStore } from "../index"
import type { ActorRecord } from "../index.t"

describe("Store", () => {
  let store: SQLiteStore

  beforeEach(() => {
    store = new SQLiteStore(":memory:")
  })

  afterEach(() => {
    store.close()
  })

  describe("Операции с метаданными", () => {
    test("должен сохранять метаданные и возвращать хеш", () => {
      const fingerprint = "test-fingerprint"

      // Сохраняем метаданные
      const hash = store.saveMetaIsNotExists(fingerprint)

      // Проверяем, что хеш создан
      expect(hash, "Хеш должен быть создан").toBeDefined()
      expect(typeof hash, "Хеш должен быть строкой").toBe("string")
      expect(hash.length, "Хеш должен иметь длину").toBeGreaterThan(0)

      // Получаем метаданные
      const meta = store.getMeta(hash)

      // Проверяем, что метаданные корректно сохранились
      expect(meta, "Метаданные должны быть определены").toBeDefined()

      if (meta) {
        expect(meta.meta, "Мета метаданных должна совпадать с хешем").toBe(hash)
        expect(meta.fingerprint, "Отпечаток метаданных должен совпадать").toBe(fingerprint)
        expect(meta.timestamp, "Временная метка должна быть определена").toBeDefined()
      }
    })

    test("должен возвращать тот же хеш при повторном вызове", () => {
      const fingerprint = "test-fingerprint"

      // Первый вызов
      const hash1 = store.saveMetaIsNotExists(fingerprint)

      // Второй вызов с тем же fingerprint
      const hash2 = store.saveMetaIsNotExists(fingerprint)

      // Проверяем, что хеши одинаковые
      expect(hash1, "Хеши должны быть одинаковыми").toBe(hash2)
    })

    test("должен возвращать null для несуществующих метаданных", () => {
      const result = store.getMeta("non-existent-hash")
      expect(result, "Для несуществующего хеша должен возвращаться null").toBeNull()
    })
  })

  describe("Операции с акторами", () => {
    test("должен создавать и получать актора", () => {
      // Сначала создаем мета-запись
      const fingerprint = "test-fingerprint"
      const metaHash = store.saveMetaIsNotExists(fingerprint)

      const actorData = {
        meta: metaHash,
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      }

      // Создаем актора
      const actor = store.saveActorIsNotExist(actorData)

      // Проверяем, что актор корректно создан
      expect(actor, "Актор должен быть определен").toBeDefined()

      if (actor) {
        expect(actor.id, "ID актора должен быть больше 0").toBeGreaterThan(0)
        expect(actor.meta, "Мета метаданных актора должна совпадать").toBe(actorData.meta)
        expect(actor.parent_id, "ID родительского актора должен быть null").toBe(actorData.parent_id)
        expect(actor.idx, "Индекс актора должен совпадать").toBe(actorData.idx)
        expect(actor.snapshot, "Снапшот актора должен совпадать").toBe(actorData.snapshot)
        expect(actor.timestamp, "Временная метка должна быть определена").toBeDefined()
      }
    })

    test("должен возвращать существующего актора при повторном вызове", () => {
      // Создаем мета-запись
      const fingerprint = "test-fingerprint"
      const metaHash = store.saveMetaIsNotExists(fingerprint)

      const actorData = {
        meta: metaHash,
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      }

      // Первый вызов - создает актора
      const actor1 = store.saveActorIsNotExist(actorData)

      // Второй вызов - должен вернуть того же актора
      const actor2 = store.saveActorIsNotExist(actorData)

      // Проверяем, что это тот же актор
      expect(actor1.id, "ID акторов должны совпадать").toBe(actor2.id)
      expect(actor1.meta, "Мета акторов должны совпадать").toBe(actor2.meta)
    })

    test("должен создавать актора с родителем", () => {
      // Создаем мета-записи
      const parentFingerprint = "parent-fingerprint"
      const childFingerprint = "child-fingerprint"

      const parentMetaHash = store.saveMetaIsNotExists(parentFingerprint)
      const childMetaHash = store.saveMetaIsNotExists(childFingerprint)

      // Создаем родительского актора
      const parentActor = store.saveActorIsNotExist({
        meta: parentMetaHash,
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      })

      // Создаем дочернего актора
      const childActor = store.saveActorIsNotExist({
        meta: childMetaHash,
        parent_id: parentActor.id,
        idx: 0,
        snapshot: "{}",
      })

      // Проверяем, что дочерний актор создан корректно
      expect(childActor, "Дочерний актор должен быть определен").toBeDefined()
      expect(childActor.parent_id, "Дочерний актор должен иметь правильный parent_id").toBe(parentActor.id)
    })
  })

  describe("Интеграционные тесты", () => {
    test("должен корректно работать полный цикл создания мета и актора", () => {
      const fingerprint = "integration-test-fingerprint"

      // 1. Создаем мета-запись
      const metaHash = store.saveMetaIsNotExists(fingerprint)

      // 2. Проверяем, что мета-запись создана
      const meta = store.getMeta(metaHash)
      expect(meta, "Мета-запись должна быть создана").toBeDefined()
      expect(meta?.fingerprint, "Fingerprint должен совпадать").toBe(fingerprint)

      // 3. Создаем актора
      const actor = store.saveActorIsNotExist({
        meta: metaHash,
        parent_id: null,
        idx: 0,
        snapshot: JSON.stringify({ test: "data" }),
      })

      // 4. Проверяем, что актор создан
      expect(actor, "Актор должен быть создан").toBeDefined()
      expect(actor.meta, "Актор должен ссылаться на правильную мету").toBe(metaHash)
      expect(actor.snapshot, "Снапшот актора должен совпадать").toBe(JSON.stringify({ test: "data" }))
    })

    test("должен получать всех акторов через getAllActors", () => {
      // Создаем несколько мета-записей
      const fingerprint1 = "fingerprint-1"
      const fingerprint2 = "fingerprint-2"

      const metaHash1 = store.saveMetaIsNotExists(fingerprint1)
      const metaHash2 = store.saveMetaIsNotExists(fingerprint2)

      // Создаем несколько акторов
      const actor1 = store.saveActorIsNotExist({
        meta: metaHash1,
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      })

      const actor2 = store.saveActorIsNotExist({
        meta: metaHash2,
        parent_id: null,
        idx: 0,
        snapshot: "{}",
      })

      // Получаем всех акторов
      const allActors = store.getAllActors()

      // Проверяем, что получены все акторы
      expect(allActors, "Должны быть получены все акторы").toBeDefined()
      expect(Array.isArray(allActors), "Результат должен быть массивом").toBe(true)
      expect(allActors.length, "Должно быть 2 актора").toBeGreaterThanOrEqual(2)

      // Проверяем, что наши акторы присутствуют в списке
      const actorIds = allActors.map((actor) => actor.id)
      expect(actorIds, "Список должен содержать ID первого актора").toContain(actor1.id)
      expect(actorIds, "Список должен содержать ID второго актора").toContain(actor2.id)
    })
  })
})
