import { describe, it, expect, beforeEach } from "bun:test"
import { Fields } from "../src/fields"
import type { Atom } from "../atom"

const A = (id: string, payload?: unknown): Atom => ({ id, payload } as unknown as Atom)

describe("Продвижение детей при нерекурсивном удалении", () => {
  let fields: Fields

  beforeEach(() => {
    fields = Fields.get()
    Fields.set(new (Fields as any)())
    fields = Fields.get()
  })

  it("один ребенок должен занять место родителя", () => {
    // Создаем структуру: root -> parent -> child
    fields.createChildren(null, A("root"))
    fields.createChildren("root", A("parent"))
    fields.createChildren("parent", A("child"))

    // Проверяем начальную структуру
    expect(fields.getChildren("root")).toEqual(["parent"])
    expect(fields.getChildren("parent")).toEqual(["child"])
    expect(fields.getChildren("child")).toEqual([])

    // Удаляем parent без рекурсии
    fields.remove("parent", false)

    // Проверяем, что child теперь прямой ребенок root
    expect(fields.getChildren("root")).toEqual(["child"])
    expect(fields.getChildren("child")).toEqual([])

    // Проверяем, что parent больше нет
    expect(fields.has("parent")).toBe(false)
    expect(fields.has("child")).toBe(true)
  })

  it("несколько детей должны встать на место родителя в том же порядке", () => {
    // Создаем структуру: root -> parent -> [child1, child2, child3]
    fields.createChildren(null, A("root"))
    fields.createChildren("root", A("parent"))
    fields.createChildren("parent", A("child1"))
    fields.createChildren("parent", A("child2"))
    fields.createChildren("parent", A("child3"))

    // Проверяем начальную структуру
    expect(fields.getChildren("root")).toEqual(["parent"])
    expect(fields.getChildren("parent")).toEqual(["child1", "child2", "child3"])

    // Удаляем parent без рекурсии
    fields.remove("parent", false)

    // Проверяем, что дети теперь прямые дети root в том же порядке
    expect(fields.getChildren("root")).toEqual(["child1", "child2", "child3"])
    expect(fields.getChildren("child1")).toEqual([])
    expect(fields.getChildren("child2")).toEqual([])
    expect(fields.getChildren("child3")).toEqual([])

    // Проверяем, что parent больше нет
    expect(fields.has("parent")).toBe(false)
    expect(fields.has("child1")).toBe(true)
    expect(fields.has("child2")).toBe(true)
    expect(fields.has("child3")).toBe(true)
  })

  it("дети должны встать между соседями родителя", () => {
    // Создаем структуру: root -> [sibling1, parent, sibling2] -> parent -> [child1, child2]
    fields.createChildren(null, A("root"))
    fields.createChildren("root", A("sibling1"))
    fields.createChildren("root", A("parent"))
    fields.createChildren("root", A("sibling2"))
    fields.createChildren("parent", A("child1"))
    fields.createChildren("parent", A("child2"))

    // Проверяем начальную структуру
    expect(fields.getChildren("root")).toEqual(["sibling1", "parent", "sibling2"])
    expect(fields.getChildren("parent")).toEqual(["child1", "child2"])

    // Удаляем parent без рекурсии
    fields.remove("parent", false)

    // Проверяем, что дети встали на место parent между sibling1 и sibling2
    expect(fields.getChildren("root")).toEqual(["sibling1", "child1", "child2", "sibling2"])
    expect(fields.getChildren("child1")).toEqual([])
    expect(fields.getChildren("child2")).toEqual([])

    // Проверяем, что parent больше нет, но siblings остались
    expect(fields.has("parent")).toBe(false)
    expect(fields.has("sibling1")).toBe(true)
    expect(fields.has("sibling2")).toBe(true)
    expect(fields.has("child1")).toBe(true)
    expect(fields.has("child2")).toBe(true)
  })

  it("корневой элемент с детьми должен перенести их в корень", () => {
    // Создаем структуру: root -> [child1, child2]
    fields.createChildren(null, A("root"))
    fields.createChildren("root", A("child1"))
    fields.createChildren("root", A("child2"))

    // Проверяем начальную структуру
    expect(fields.getChildren("root")).toEqual(["child1", "child2"])

    // Удаляем root без рекурсии
    fields.remove("root", false)

    // Проверяем, что дети стали корневыми
    expect(fields.getChildren(null)).toEqual(["child1", "child2"])
    expect(fields.getChildren("child1")).toEqual([])
    expect(fields.getChildren("child2")).toEqual([])

    // Проверяем, что root больше нет
    expect(fields.has("root")).toBe(false)
    expect(fields.has("child1")).toBe(true)
    expect(fields.has("child2")).toBe(true)
  })

  it("рекурсивное удаление должно удалить всех детей", () => {
    // Создаем структуру: root -> parent -> [child1, child2]
    fields.createChildren(null, A("root"))
    fields.createChildren("root", A("parent"))
    fields.createChildren("parent", A("child1"))
    fields.createChildren("parent", A("child2"))

    // Проверяем начальную структуру
    expect(fields.getChildren("root")).toEqual(["parent"])
    expect(fields.getChildren("parent")).toEqual(["child1", "child2"])

    // Удаляем parent с рекурсией
    fields.remove("parent", true)

    // Проверяем, что все удалены
    expect(fields.getChildren("root")).toEqual([])
    expect(fields.has("parent")).toBe(false)
    expect(fields.has("child1")).toBe(false)
    expect(fields.has("child2")).toBe(false)
  })

  it("удаление элемента без детей не должно влиять на структуру", () => {
    // Создаем структуру: root -> [parent1, parent2] -> parent1 -> child
    fields.createChildren(null, A("root"))
    fields.createChildren("root", A("parent1"))
    fields.createChildren("root", A("parent2"))
    fields.createChildren("parent1", A("child"))

    // Проверяем начальную структуру
    expect(fields.getChildren("root")).toEqual(["parent1", "parent2"])
    expect(fields.getChildren("parent1")).toEqual(["child"])
    expect(fields.getChildren("parent2")).toEqual([])

    // Удаляем parent2 без рекурсии (у него нет детей)
    fields.remove("parent2", false)

    // Проверяем, что структура не изменилась
    expect(fields.getChildren("root")).toEqual(["parent1"])
    expect(fields.getChildren("parent1")).toEqual(["child"])
    expect(fields.has("parent2")).toBe(false)
    expect(fields.has("parent1")).toBe(true)
    expect(fields.has("child")).toBe(true)
  })
})
