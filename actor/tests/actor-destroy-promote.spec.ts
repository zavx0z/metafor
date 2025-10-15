import { describe, it, expect, beforeEach } from "bun:test"
import { Fields } from "../fields"
import type { Actor } from "../actor"

const A = (id: string, payload?: unknown): Actor => ({ id, payload }) as unknown as Actor

describe("Удаление акторов с продвижением детей", () => {
  let fields: Fields

  beforeEach(() => {
    fields = Fields.get()
    Fields.set(new (Fields as any)())
    fields = Fields.get()
  })

  it("нерекурсивное удаление должно продвинуть детей", () => {
    // Создаем структуру: root -> parent -> [child1, child2]
    fields.createChildren(null, A("root"))
    fields.createChildren("root", A("parent"))
    fields.createChildren("parent", A("child1"))
    fields.createChildren("parent", A("child2"))

    // Проверяем начальную структуру
    expect(fields.getChildren("root")).toEqual(["parent"])
    expect(fields.getChildren("parent")).toEqual(["child1", "child2"])

    // Удаляем parent без рекурсии
    fields.remove("parent", false)

    // Проверяем, что дети стали прямыми детьми root
    expect(fields.getChildren("root")).toEqual(["child1", "child2"])
    expect(fields.getChildren("child1")).toEqual([])
    expect(fields.getChildren("child2")).toEqual([])

    // Проверяем, что parent удален, но дети остались
    expect(fields.has("parent")).toBe(false)
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

    // Проверяем, что parent удален, но siblings и дети остались
    expect(fields.has("parent")).toBe(false)
    expect(fields.has("sibling1")).toBe(true)
    expect(fields.has("sibling2")).toBe(true)
    expect(fields.has("child1")).toBe(true)
    expect(fields.has("child2")).toBe(true)
  })
})
