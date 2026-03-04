/**
 * Тесты для модуля actor.
 */

import { describe, expect, test, beforeEach } from "bun:test"
import {
  createActor,
  getActor,
  updateActor,
  deleteActor,
  getAllActors,
  getActorsByParent,
  _resetStore,
} from "./actor"
import { first, between } from "./order"

describe("actor", () => {
  beforeEach(() => {
    _resetStore()
  })

  describe("createActor()", () => {
    test("создаёт запись", () => {
      const uuid = "uuid-1"
      const src = "./test.ts"

      const actor = createActor(uuid, src, null, first())

      expect(actor.uuid).toBe(uuid)
      expect(actor.src).toBe(src)
      expect(actor.parentUuid).toBeNull()
      expect(actor.status).toBe("pending")
    })
  })

  describe("getActor()", () => {
    test("находит по UUID", () => {
      const uuid = "uuid-1"
      createActor(uuid, "./test.ts", null, first())

      const actor = getActor(uuid)

      expect(actor).toBeDefined()
      expect(actor?.uuid).toBe(uuid)
    })

    test("возвращает undefined если не найден", () => {
      const actor = getActor("non-existent")
      expect(actor).toBeUndefined()
    })
  })

  describe("updateActor()", () => {
    test("обновляет поля", () => {
      const uuid = "uuid-1"
      createActor(uuid, "./test.ts", null, first())

      const updated = updateActor(uuid, {
        status: "active",
        monadId: "monad-1",
      })

      expect(updated?.status).toBe("active")
      expect(updated?.monadId).toBe("monad-1")

      const actor = getActor(uuid)
      expect(actor?.status).toBe("active")
    })

    test("возвращает undefined если не найден", () => {
      const updated = updateActor("non-existent", { status: "active" })
      expect(updated).toBeUndefined()
    })
  })

  describe("deleteActor()", () => {
    test("удаляет", () => {
      const uuid = "uuid-1"
      createActor(uuid, "./test.ts", null, first())

      deleteActor(uuid)

      const actor = getActor(uuid)
      expect(actor).toBeUndefined()
    })
  })

  describe("getAllActors()", () => {
    test("возвращает все", () => {
      createActor("uuid-1", "./test1.ts", null, first())
      createActor("uuid-2", "./test2.ts", null, between(first(), null))

      const all = getAllActors()

      expect(all).toHaveLength(2)
      expect(all.map((a) => a.uuid)).toEqual(
        expect.arrayContaining(["uuid-1", "uuid-2"])
      )
    })
  })

  describe("getActorsByParent()", () => {
    test("фильтрует по родителю", () => {
      const parent = "parent-1"
      createActor(parent, "./parent.ts", null, first())
      createActor("child-1", "./child1.ts", parent, first())
      createActor("child-2", "./child2.ts", parent, between(first(), null))
      createActor("other", "./other.ts", null, between(between(first(), null), null))

      const children = getActorsByParent(parent)

      expect(children).toHaveLength(2)
      expect(children.map((c) => c.uuid)).toEqual(
        expect.arrayContaining(["child-1", "child-2"])
      )
    })
  })
})
