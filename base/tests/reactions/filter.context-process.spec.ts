import { reactionsFromSchema } from "../../reactions"
import { reactionsSchema } from "../../../schema/reactions"
import { describe, it, expect } from "bun:test"

type State = "idle" | "active"

describe("Фильтрация по context.process с in", () => {
  it("фильтр actor in context.process должен работать", () => {
    const core: { called: boolean } = { called: false }
    const context = { process: ["user-1", "user-2", "admin-1"] }

    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self, context }) => {
              console.log("=== ОТЛАДКА ФИЛЬТРА ===")
              console.log("self.actor:", self.actor)
              console.log("context.process:", context.process)
              console.log("context.process.includes(self.actor):", context.process.includes(self.actor))

              const conditions = {
                actor: { in: context.process },
                path: "/state",
                op: "replace",
                value: "ожидание",
              }
              console.log("Условия фильтра:", conditions)
              return conditions
            })
            .equal(({ core }) => {
              console.log("=== РЕАКЦИЯ СРАБОТАЛА ===")
              core.called = true
            }),
        ],
      ]) as any
    )

    console.log("=== ЗАПУСК ТЕСТА ===")
    console.log("context:", context)

    // Тест 1: actor входит в context.process
    registry.run({
      meta: "test",
      actor: "user-1", // входит в context.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "ожидание" },
      context,
      state: "idle",
      core,
      update: () => {},
      self: { meta: "test", actor: "user-1", path: "0", destroy: () => {} },
    })

    console.log("core.called после теста:", core.called)
    expect(core.called, "реакция должна сработать когда actor входит в context.process").toBe(true)
  })

  it("фильтр actor in context.process НЕ должен сработать для неизвестного actor", () => {
    const core: { called: boolean } = { called: false }
    const context = { process: ["user-1", "user-2", "admin-1"] }

    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self, context }) => ({
              actor: { in: context.process },
              path: "/state",
              op: "replace",
              value: "ожидание",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    // Тест 2: actor НЕ входит в context.process
    core.called = false // сбрасываем
    registry.run({
      meta: "test",
      actor: "unknown-actor", // НЕ входит в context.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "ожидание" },
      context,
      state: "idle",
      core,
      update: () => {},
      self: { meta: "test", actor: "unknown-actor", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция НЕ должна сработать когда actor НЕ входит в context.process").toBe(false)
  })

  it("фильтр actor in context.process НЕ должен сработать при неверном path", () => {
    const core: { called: boolean } = { called: false }
    const context = { process: ["user-1", "user-2", "admin-1"] }

    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self, context }) => ({
              actor: { in: context.process },
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
      actor: "user-1", // входит в context.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: "ожидание" }, // неверный path
      context,
      state: "idle",
      core,
      update: () => {},
      self: { meta: "test", actor: "user-1", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция НЕ должна сработать при неверном path").toBe(false)
  })

  it("фильтр actor in context.process НЕ должен сработать при неверном value", () => {
    const core: { called: boolean } = { called: false }
    const context = { process: ["user-1", "user-2", "admin-1"] }

    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self, context }) => ({
              actor: { in: context.process },
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
      actor: "user-1", // входит в context.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "активен" }, // неверный value
      context,
      state: "idle",
      core,
      update: () => {},
      self: { meta: "test", actor: "user-1", path: "0", destroy: () => {} },
    })

    expect(core.called, "реакция НЕ должна сработать при неверном value").toBe(false)
  })
})
