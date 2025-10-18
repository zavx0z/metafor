import { reactionsFromSchema } from "../../src/reactions"
import { reactionsSchema } from "../../../meta/reactions"
import { describe, it, expect } from "bun:test"
import { contextSchema, contextFromSchema } from "@zavx0z/context"

type State = "idle" | "active"

describe("Фильтрация по context.process с in", () => {
  it("фильтр atom in context.process должен работать", () => {
    const core: { called: boolean } = { called: false }
    const context = contextSchema((t) => ({ process: t.array.required(["user-1", "user-2", "admin-1"]) }))

    const registry = reactionsFromSchema(
      reactionsSchema<typeof context, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ context }) => ({
              atom: { in: context.process },
              path: "/state",
              op: "replace",
              value: "ожидание",
            }))
            .equal(({ core }) => {
              core.called = true
            }),
        ],
      ]) as any
    )

    // Тест 1: atom входит в context.process
    registry.run({
      meta: "test",
      atom: "user-1", // входит в context.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "ожидание" },
      context: contextFromSchema(context).context,
      state: "idle",
      core,
      update: () => ({}),
      self: { meta: "test", atom: "user-1", path: "0" },
      destroy: () => {},
    })

    expect(core.called, "реакция должна сработать когда atom входит в context.process").toBe(true)
  })

  it("фильтр atom in context.process НЕ должен сработать для неизвестного atom", () => {
    const core: { called: boolean } = { called: false }
    const context = contextSchema((t) => ({ process: t.array.required(["user-1", "user-2", "admin-1"]) }))

    const registry = reactionsFromSchema(
      reactionsSchema<typeof context, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self, context }) => ({
              atom: { in: context.process },
              path: "/state",
              op: "replace",
              value: "ожидание",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    // Тест 2: atom НЕ входит в context.process
    core.called = false // сбрасываем
    registry.run({
      meta: "test",
      atom: "unknown-atom", // НЕ входит в context.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "ожидание" },
      context: contextFromSchema(context).context,
      state: "idle",
      core,
      update: () => ({}),
      self: { meta: "test", atom: "unknown-atom", path: "0" },
      destroy: () => {},
    })

    expect(core.called, "реакция НЕ должна сработать когда atom НЕ входит в context.process").toBe(false)
  })

  it("фильтр atom in context.process НЕ должен сработать при неверном path", () => {
    const core: { called: boolean } = { called: false }
    const context = contextSchema((t) => ({ process: t.array.required(["user-1", "user-2", "admin-1"]) }))

    const registry = reactionsFromSchema(
      reactionsSchema<typeof context, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self, context }) => ({
              atom: { in: context.process },
              path: "/state",
              op: "replace",
              value: "ожидание",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    // Тест 3: неверный path
    registry.run({
      meta: "test",
      atom: "user-1", // входит в context.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: "ожидание" }, // неверный path
      context: contextFromSchema(context).context,
      state: "idle",
      core,
      update: () => ({}),
      self: { meta: "test", atom: "user-1", path: "0" },
      destroy: () => {},
    })

    expect(core.called, "реакция НЕ должна сработать при неверном path").toBe(false)
  })

  it("фильтр atom in context.process НЕ должен сработать при неверном value", () => {
    const core: { called: boolean } = { called: false }
    const context = contextSchema((t) => ({ process: t.array.required(["user-1", "user-2", "admin-1"]) }))

    const registry = reactionsFromSchema(
      reactionsSchema<typeof context, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self, context }) => ({
              atom: { in: context.process },
              path: "/state",
              op: "replace",
              value: "ожидание",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    // Тест 4: неверный value
    registry.run({
      meta: "test",
      atom: "user-1", // входит в context.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "активен" }, // неверный value
      context: contextFromSchema(context).context,
      state: "idle",
      core,
      update: () => ({}),
      self: { meta: "test", atom: "user-1", path: "0" },
      destroy: () => {},
    })

    expect(core.called, "реакция НЕ должна сработать при неверном value").toBe(false)
  })
})
