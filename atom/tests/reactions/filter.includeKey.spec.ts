import { reactionsFromSchema } from "../../src/reactions"
import { reactionsSchema } from "../../../meta/reactions"
import { describe, it, expect } from "bun:test"
import { type Update } from "@zavx0z/context"

type State = "idle" | "active"

const fakeContext = { process: ["user-1", "user-2"] }
const fakeUpdate = (() => {}) as unknown as Update<any>

describe("Фильтрация по объектам с includeKey", () => {
  it("фильтр includeKey для объекта - объект содержит ключ", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: { includeKey: "userId" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: { userId: 123, name: "John" } },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: () => {},
    })

    expect(mass.called, "реакция должна сработать когда объект содержит указанный ключ").toBe(true)
  })

  it("фильтр includeKey для объекта - объект НЕ содержит ключ", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: { includeKey: "userId" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: { name: "John", email: "john@example.com" } },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: () => {},
    })

    expect(mass.called, "реакция НЕ должна сработать когда объект НЕ содержит указанный ключ").toBe(false)
  })

  it("фильтр includeKey для объекта - пустой объект", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: { includeKey: "userId" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: {} },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: () => {},
    })

    expect(mass.called, "реакция НЕ должна сработать когда объект пустой").toBe(false)
  })

  it("фильтр includeKey для объекта - null значение", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: { includeKey: "userId" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: null },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: () => {},
    })

    expect(mass.called, "реакция НЕ должна сработать когда значение null").toBe(false)
  })

  it("фильтр includeKey для объекта - не объект", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: { includeKey: "userId" } }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: 42 },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      self: { meta: "test", atom: "test-atom", path: "0" },
      destroy: () => {},
    })

    expect(mass.called, "реакция НЕ должна сработать когда значение не объект").toBe(false)
  })
})
