/**
 * Тесты для модуля atom.
 */

import { describe, expect, test, beforeEach } from "bun:test"
import {
  createAtom,
  getAtom,
  updateAtom,
  deleteAtom,
  getAllAtoms,
  getAtomsByParent,
  _resetStore,
} from "./atom"
import { first, between } from "./order"

describe("atom", () => {
  beforeEach(() => {
    _resetStore()
  })

  describe("createAtom()", () => {
    test("создаёт запись", () => {
      const uuid = "uuid-1"
      const src = "./test.ts"

      const atom = createAtom(uuid, src, null, first())

      expect(atom.uuid).toBe(uuid)
      expect(atom.src).toBe(src)
      expect(atom.parentUuid).toBeNull()
      expect(atom.status).toBe("pending")
    })
  })

  describe("getAtom()", () => {
    test("находит по UUID", () => {
      const uuid = "uuid-1"
      createAtom(uuid, "./test.ts", null, first())

      const atom = getAtom(uuid)

      expect(atom).toBeDefined()
      expect(atom?.uuid).toBe(uuid)
    })

    test("возвращает undefined если не найден", () => {
      const atom = getAtom("non-existent")
      expect(atom).toBeUndefined()
    })
  })

  describe("updateAtom()", () => {
    test("обновляет поля", () => {
      const uuid = "uuid-1"
      createAtom(uuid, "./test.ts", null, first())

      const updated = updateAtom(uuid, {
        status: "active",
        src: "./next.ts",
      })

      expect(updated?.status).toBe("active")
      expect(updated?.src).toBe("./next.ts")

      const atom = getAtom(uuid)
      expect(atom?.status).toBe("active")
      expect(atom?.src).toBe("./next.ts")
    })

    test("возвращает undefined если не найден", () => {
      const updated = updateAtom("non-existent", { status: "active" })
      expect(updated).toBeUndefined()
    })
  })

  describe("deleteAtom()", () => {
    test("удаляет", () => {
      const uuid = "uuid-1"
      createAtom(uuid, "./test.ts", null, first())

      deleteAtom(uuid)

      const atom = getAtom(uuid)
      expect(atom).toBeUndefined()
    })
  })

  describe("getAllAtoms()", () => {
    test("возвращает все", () => {
      createAtom("uuid-1", "./test1.ts", null, first())
      createAtom("uuid-2", "./test2.ts", null, between(first(), null))

      const all = getAllAtoms()

      expect(all).toHaveLength(2)
      expect(all.map((a) => a.uuid)).toEqual(
        expect.arrayContaining(["uuid-1", "uuid-2"])
      )
    })
  })

  describe("getAtomsByParent()", () => {
    test("фильтрует по родителю", () => {
      const parent = "parent-1"
      createAtom(parent, "./parent.ts", null, first())
      createAtom("child-1", "./child1.ts", parent, first())
      createAtom("child-2", "./child2.ts", parent, between(first(), null))
      createAtom("other", "./other.ts", null, between(between(first(), null), null))

      const children = getAtomsByParent(parent)

      expect(children).toHaveLength(2)
      expect(children.map((c) => c.uuid)).toEqual(
        expect.arrayContaining(["child-1", "child-2"])
      )
    })
  })
})
