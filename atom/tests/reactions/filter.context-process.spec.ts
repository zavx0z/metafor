import { reactionsFromSchema } from "../../src/reactions"
import { reactionsSchema } from "../../../meta/reactions"
import { describe, it, expect } from "bun:test"
import { contextSchema, contextFromSchema } from "@zavx0z/context"

type State = "idle" | "active"

describe("Фильтрация по fields.process с in", () => {
  it("фильтр atom in fields.process должен работать", () => {
    const mass: { called: boolean } = { called: false }
    const fields = contextSchema((t) => ({ process: t.array.required(["user-1", "user-2", "admin-1"]) }))

    const registry = reactionsFromSchema(
      reactionsSchema<typeof fields, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ fields }) => ({
              atom: { in: fields.process },
              path: "/state",
              op: "replace",
              value: "ожидание",
            }))
            .equal(({ mass }) => {
              mass.called = true
            }),
        ],
      ]) as any
    )

    // Тест 1: atom входит в fields.process
    registry.run({
      meta: "test",
      atom: "user-1", // входит в fields.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "ожидание" },
      fields: { process: ["user-1", "user-2", "admin-1"] },
      state: "idle",
      mass,
      update: () => ({}),
      self: { meta: "test", atom: "user-1", path: "0" },
      destroy: () => {},
    })

    expect(mass.called, "реакция должна сработать когда atom входит в fields.process").toBe(true)
  })

  it("фильтр atom in fields.process НЕ должен сработать для неизвестного atom", () => {
    const mass: { called: boolean } = { called: false }
    const fields = contextSchema((t) => ({ process: t.array.required(["user-1", "user-2", "admin-1"]) }))

    const registry = reactionsFromSchema(
      reactionsSchema<typeof fields, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self, fields }) => ({
              atom: { in: fields.process },
              path: "/state",
              op: "replace",
              value: "ожидание",
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    // Тест 2: atom НЕ входит в fields.process
    mass.called = false // сбрасываем
    registry.run({
      meta: "test",
      atom: "unknown-atom", // НЕ входит в fields.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "ожидание" },
      fields: { process: ["user-1", "user-2", "admin-1"] },
      state: "idle",
      mass,
      update: () => ({}),
      self: { meta: "test", atom: "unknown-atom", path: "0" },
      destroy: () => {},
    })

    expect(mass.called, "реакция НЕ должна сработать когда atom НЕ входит в fields.process").toBe(false)
  })

  it("фильтр atom in fields.process НЕ должен сработать при неверном path", () => {
    const mass: { called: boolean } = { called: false }
    const fields = contextSchema((t) => ({ process: t.array.required(["user-1", "user-2", "admin-1"]) }))

    const registry = reactionsFromSchema(
      reactionsSchema<typeof fields, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self, fields }) => ({
              atom: { in: fields.process },
              path: "/state",
              op: "replace",
              value: "ожидание",
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    // Тест 3: неверный path
    registry.run({
      meta: "test",
      atom: "user-1", // входит в fields.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/fields", value: "ожидание" }, // неверный path
      fields: { process: ["user-1", "user-2", "admin-1"] },
      state: "idle",
      mass,
      update: () => ({}),
      self: { meta: "test", atom: "user-1", path: "0" },
      destroy: () => {},
    })

    expect(mass.called, "реакция НЕ должна сработать при неверном path").toBe(false)
  })

  it("фильтр atom in fields.process НЕ должен сработать при неверном value", () => {
    const mass: { called: boolean } = { called: false }
    const fields = contextSchema((t) => ({ process: t.array.required(["user-1", "user-2", "admin-1"]) }))

    const registry = reactionsFromSchema(
      reactionsSchema<typeof fields, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self, fields }) => ({
              atom: { in: fields.process },
              path: "/state",
              op: "replace",
              value: "ожидание",
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    // Тест 4: неверный value
    registry.run({
      meta: "test",
      atom: "user-1", // входит в fields.process
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "активен" }, // неверный value
      fields: { process: ["user-1", "user-2", "admin-1"] },
      state: "idle",
      mass,
      update: () => ({}),
      self: { meta: "test", atom: "user-1", path: "0" },
      destroy: () => {},
    })

    expect(mass.called, "реакция НЕ должна сработать при неверном value").toBe(false)
  })
})
