import { reactionsFromSchema } from "../src/reactions"
import { contextSchema, type Update, type Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import { reactionsSchema } from "../../meta/reactions"

const schema = contextSchema((t) => ({
  value: t.number.required(0),
  name: t.string.required(""),
  isActive: t.boolean.required(false),
  tags: t.array.required([]),
}))
type Ctx = typeof schema
type State = "idle" | "active"

describe("Фильтрация по meta и actor с in/notIn", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 } as any

  it("фильтр in для meta - значение входит в массив", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { in: ["user", "admin", "guest"] } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "admin",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "admin", actor: "test-actor", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция должна сработать когда meta входит в массив").toBe(true)
  })

  it("фильтр in для meta - значение НЕ входит в массив", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { in: ["user", "admin", "guest"] } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "moderator",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "moderator", actor: "test-actor", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция НЕ должна сработать когда meta НЕ входит в массив").toBe(false)
  })

  it("фильтр in для actor - значение входит в массив", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ actor: { in: ["actor-1", "actor-2", "actor-3"] } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "actor-2",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "actor-2", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция должна сработать когда actor входит в массив").toBe(true)
  })

  it("фильтр notIn для meta - значение НЕ входит в исключающий массив", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ meta: { notIn: ["banned", "suspended"] } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "active",
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "active", actor: "test-actor", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция должна сработать когда meta НЕ входит в исключающий массив").toBe(true)
  })

  it("фильтр notIn для actor - значение входит в исключающий массив", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ actor: { notIn: ["blocked-1", "blocked-2"] } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      actor: "blocked-1",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", actor: "blocked-1", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция НЕ должна сработать когда actor входит в исключающий массив").toBe(false)
  })
})
