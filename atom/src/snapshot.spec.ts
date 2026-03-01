import { describe, it, expect } from "bun:test"
import { applyPatchesToSnapshot } from "./snapshot"
import type { AtomPayload } from "../gravity.t"

describe("applyPatchesToSnapshot", () => {
  it("должен применять replace операции", () => {
    const snapshot: AtomPayload = {
      path: "/test",
      state: "initial",
      fields: { value: 10, flag: false },
    }

    const patches = [
      { op: "replace" as const, path: "/state", value: "updated" },
      { op: "replace" as const, path: "/fields/value", value: 20 },
      { op: "replace" as const, path: "/fields/flag", value: true },
    ]

    const result = applyPatchesToSnapshot(snapshot, patches)

    expect(result.state).toBe("updated")
    expect(result.fields.value).toBe(20)
    expect(result.fields.flag).toBe(true)
    expect(result.path).toBe("/test") // Не изменилось
  })

  it("должен применять add операции", () => {
    const snapshot: AtomPayload = {
      path: "/test",
      state: "initial",
      fields: { items: [1, 2] },
    }

    const patches = [
      { op: "add" as const, path: "/fields/items/1", value: 99 },
      { op: "add" as const, path: "/fields/newField", value: "test" },
    ]

    const result = applyPatchesToSnapshot(snapshot, patches)

    expect(result.fields.items).toEqual([1, 99, 2])
    expect(result.fields.newField).toBe("test")
  })

  it("должен применять remove операции", () => {
    const snapshot: AtomPayload = {
      path: "/test",
      state: "initial",
      fields: { items: [1, 2, 3], temp: "remove" },
    }

    const patches = [
      { op: "remove" as const, path: "/fields/items/1" },
      { op: "remove" as const, path: "/fields/temp" },
    ]

    const result = applyPatchesToSnapshot(snapshot, patches)

    expect(result.fields.items).toEqual([1, 3])
    expect(result.fields.temp).toBeUndefined()
  })

  it("должен применять test операции как replace", () => {
    const snapshot: AtomPayload = {
      path: "/test",
      state: "ready",
      fields: { flag: false },
    }

    const patches = [
      { op: "test" as const, path: "/state", value: "active" },
      { op: "test" as const, path: "/fields/flag", value: true },
    ]

    const result = applyPatchesToSnapshot(snapshot, patches)

    expect(result.state).toBe("active")
    expect(result.fields.flag).toBe(true)
  })

  it("должен применять move операции", () => {
    const snapshot: AtomPayload = {
      path: "/test",
      state: "initial",
      fields: { items: [1, 2, 3, 4] },
    }

    const patches = [{ op: "move" as const, from: "/fields/items/1", path: "/fields/items/3" }]

    const result = applyPatchesToSnapshot(snapshot, patches)

    expect(result.fields.items).toEqual([1, 3, 4, 2])
  })

  it("должен обрабатывать корневой путь /", () => {
    const snapshot: AtomPayload = {
      path: "/test",
      state: "initial",
      fields: { value: 10 },
    }

    const patches = [
      { op: "replace" as const, path: "/", value: { path: "/new", state: "updated", fields: { value: 20 } } },
    ]

    const result = applyPatchesToSnapshot(snapshot, patches)

    expect(result.path).toBe("/new")
    expect(result.state).toBe("updated")
    expect(result.fields.value).toBe(20)
  })

  it("должен полностью заменять объект при корневом пути /", () => {
    const snapshot: AtomPayload = {
      path: "/old",
      state: "old",
      fields: { old: "value", extra: "field" },
    }

    const patches = [
      {
        op: "replace" as const,
        path: "/",
        value: {
          path: "/new",
          state: "new",
          fields: { new: "value" },
        },
      },
    ]

    const result = applyPatchesToSnapshot(snapshot, patches)

    // Проверяем, что старые поля удалены
    expect(result.fields.old).toBeUndefined()
    expect(result.fields.extra).toBeUndefined()

    // Проверяем, что новые поля установлены
    expect(result.path).toBe("/new")
    expect(result.state).toBe("new")
    expect(result.fields.new).toBe("value")
  })

  it("должен обрабатывать add операцию для корневого пути /", () => {
    const snapshot: AtomPayload = {
      path: "/old",
      state: "old",
      fields: { old: "value" },
    }

    const patches = [
      {
        op: "add" as const,
        path: "/",
        value: {
          path: "/new",
          state: "new",
          fields: { new: "value" },
        },
      },
    ]

    const result = applyPatchesToSnapshot(snapshot, patches)

    // add для корневого пути работает как replace
    expect(result.path).toBe("/new")
    expect(result.state).toBe("new")
    expect(result.fields.new).toBe("value")
    expect(result.fields.old).toBeUndefined()
  })

  it("должен обрабатывать remove операцию для корневого пути /", () => {
    const snapshot: AtomPayload = {
      path: "/test",
      state: "initial",
      fields: { value: 10 },
    }

    const patches = [{ op: "remove" as const, path: "/" }]

    const result = applyPatchesToSnapshot(snapshot, patches)

    // remove для корневого пути очищает все свойства
    expect(result.path).toBeUndefined()
    expect(result.state).toBeUndefined()
    expect(result.context).toBeUndefined()
  })

  it("должен не изменять оригинальный снапшот", () => {
    const snapshot: AtomPayload = {
      path: "/test",
      state: "initial",
      fields: { value: 10 },
    }

    const originalSnapshot = JSON.parse(JSON.stringify(snapshot))

    const patches = [{ op: "replace" as const, path: "/state", value: "updated" }]

    applyPatchesToSnapshot(snapshot, patches)

    expect(snapshot).toEqual(originalSnapshot)
  })

  it("должен обрабатывать пустой массив патчей", () => {
    const snapshot: AtomPayload = {
      path: "/test",
      state: "initial",
      fields: { value: 10 },
    }

    const result = applyPatchesToSnapshot(snapshot, [])

    expect(result).toEqual(snapshot)
  })

  it("должен обрабатывать сложные вложенные структуры", () => {
    const snapshot: AtomPayload = {
      path: "/test",
      state: "initial",
      fields: {
        user: { name: "John", age: 30 },
        items: [
          { id: 1, value: "a" },
          { id: 2, value: "b" },
        ],
      },
    }

    const patches = [
      { op: "replace" as const, path: "/fields/user/age", value: 31 },
      { op: "add" as const, path: "/fields/items/1", value: { id: 3, value: "c" } },
      { op: "replace" as const, path: "/fields/items/0/value", value: "updated" },
    ]

    const result = applyPatchesToSnapshot(snapshot, patches)

    expect(result.fields.user.age).toBe(31)
    expect(result.fields.items).toEqual([
      { id: 1, value: "updated" },
      { id: 3, value: "c" },
      { id: 2, value: "b" },
    ])
  })
})
