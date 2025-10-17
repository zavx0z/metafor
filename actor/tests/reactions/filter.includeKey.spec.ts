import { reactionsFromSchema } from "../../src/reactions"
import { reactionsSchema } from "../../../meta/reactions"
import { describe, it, expect } from "bun:test"
import { type Update } from "@zavx0z/context"

type State = "idle" | "active"

const fakeContext = { process: ["user-1", "user-2"] }
const fakeUpdate = (() => {}) as unknown as Update<any>

describe("Фильтрация по объектам с includeKey", () => {
  it("фильтр includeKey для объекта - объект содержит ключ", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: { includeKey: "userId" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: { userId: 123, name: "John" } },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция должна сработать когда объект содержит указанный ключ").toBe(true)
  })

  it("фильтр includeKey для объекта - объект НЕ содержит ключ", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: { includeKey: "userId" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: { name: "John", email: "john@example.com" } },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция НЕ должна сработать когда объект НЕ содержит указанный ключ").toBe(false)
  })

  it("фильтр includeKey для объекта - пустой объект", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: { includeKey: "userId" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: {} },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция НЕ должна сработать когда объект пустой").toBe(false)
  })

  it("фильтр includeKey для объекта - null значение", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: { includeKey: "userId" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: null },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция НЕ должна сработать когда значение null").toBe(false)
  })

  it("фильтр includeKey для объекта - не объект", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ value: { includeKey: "userId" } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: 42 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "test-actor", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция НЕ должна сработать когда значение не объект").toBe(false)
  })
})
