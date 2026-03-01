import { reactionsFromSchema } from "../../src/reactions"
import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../em.t"
import { reactionsSchema } from "../../../dsl/meta/reactions"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по операции патча (op)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 }
  const fakeMeta: string = "test"

  it("фильтрация по replace", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ op: "replace" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/fields", value: 1 },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при replace операции").toBe(true)
  })

  it("фильтрация по add", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ op: "add" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "add", path: "/fields", value: 1 },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при add операции").toBe(true)
  })

  it("фильтрация по remove", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ op: "remove" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "remove", path: "/fields" },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при remove операции").toBe(true)
  })

  it("фильтрация по test", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ op: "test" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "test", path: "/fields", value: 1 },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при test операции").toBe(true)
  })

  it("не срабатывает при несовпадении операции", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ op: "replace" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "add", path: "/fields", value: 1 },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция не должна сработать при несовпадении операции").toBe(false)
  })

  it("комбинированная фильтрация с другими условиями", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              op: "replace",
              path: "/fields",
              meta: "test",
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/fields", value: 1 },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при комбинированной фильтрации").toBe(true)
  })

  it("фильтрация по replace с path", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              op: "replace",
              path: "/fields",
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/fields", value: 1 },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при replace с path").toBe(true)
  })

  it("фильтрация по add с path", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              op: "add",
              path: "/fields",
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "add", path: "/fields", value: 1 },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при add с path").toBe(true)
  })

  it("фильтрация по remove с path", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              op: "remove",
              path: "/fields",
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "remove", path: "/fields" },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при remove с path").toBe(true)
  })

  it("фильтрация по test с path", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              op: "test",
              path: "/fields",
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "test", path: "/fields", value: 1 },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при test с path").toBe(true)
  })
})
