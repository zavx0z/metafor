import { reactionsFromSchema } from "../../src/reactions"
import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import { reactionsSchema } from "../../../dsl/meta/reactions"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по пути патча (path)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 } as any
  const fakeMeta: string = "test"

  it("фильтрация по /context", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ path: "/fields" }))
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

    expect(mass.called, "реакция должна сработать при path /context").toBe(true)
  })

  it("фильтрация по /state", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ path: "/state" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "active" },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при path /state").toBe(true)
  })

  it("фильтрация по /", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ path: "/" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "add", path: "/", value: { fields: {}, state: "idle" } },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при path /").toBe(true)
  })

  it("не срабатывает при несовпадении пути", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ path: "/fields" }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "active" },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция не должна сработать при несовпадении пути").toBe(false)
  })

  it("комбинированная фильтрация с операцией", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/fields",
              op: "replace",
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

  it("комбинированная фильтрация с метой", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
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

    expect(mass.called, "реакция должна сработать при комбинированной фильтрации с тегом").toBe(true)
  })

  it("фильтрация по /context с replace", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/fields",
              op: "replace",
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

    expect(mass.called, "реакция должна сработать при /context с replace").toBe(true)
  })

  it("фильтрация по /context с add", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/fields",
              op: "add",
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

    expect(mass.called, "реакция должна сработать при /context с add").toBe(true)
  })

  it("фильтрация по /context с remove", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/fields",
              op: "remove",
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

    expect(mass.called, "реакция должна сработать при /context с remove").toBe(true)
  })

  it("фильтрация по /context с test", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/fields",
              op: "test",
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

    expect(mass.called, "реакция должна сработать при /context с test").toBe(true)
  })

  it("фильтрация по /state с replace", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/state",
              op: "replace",
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "active" },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при /state с replace").toBe(true)
  })

  it("фильтрация по / с add", () => {
    const mass: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/",
              op: "add",
            }))
            .equal(({ mass }) => (mass.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      atom: "id",
      timestamp: Date.now(),
      patch: { op: "add", path: "/", value: { fields: {}, state: "idle" } },
      fields: fakeContext,
      state: "idle",
      mass,
      update: fakeUpdate,
      destroy: () => {},
      self: { meta: "test", atom: "test-atom", path: "0" },
    })

    expect(mass.called, "реакция должна сработать при / с add").toBe(true)
  })
})
