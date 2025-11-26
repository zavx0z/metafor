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

describe("Фильтрация по meta и atom с in/notIn", () => {
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
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "admin", atom: "test-atom", path: "0" },
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
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "moderator", atom: "test-atom", path: "0" },
    })

    expect(core.called, "реакция НЕ должна сработать когда meta НЕ входит в массив").toBe(false)
  })

  it("фильтр in для atom - значение входит в массив", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ atom: { in: ["atom-1", "atom-2", "atom-3"] } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "atom-2",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", atom: "atom-2", path: "0" },
    })

    expect(core.called, "реакция должна сработать когда atom входит в массив").toBe(true)
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
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "active", atom: "test-atom", path: "0" },
    })

    expect(core.called, "реакция должна сработать когда meta НЕ входит в исключающий массив").toBe(true)
  })

  it("фильтр notIn для atom - значение входит в исключающий массив", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ atom: { notIn: ["blocked-1", "blocked-2"] } }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: "test",
      atom: "blocked-1",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "test" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
      self: { meta: "test", atom: "blocked-1", path: "0" },
    })

    expect(core.called, "реакция НЕ должна сработать когда atom входит в исключающий массив").toBe(false)
  })
})
