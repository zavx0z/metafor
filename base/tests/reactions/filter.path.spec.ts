import { reactionsFromSchema } from "../../reactions"
import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import { reactionsSchema } from "../../../schema/reactions"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по пути патча (path)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 } as any
  const fakeMeta: string = "test"

  it("фильтрация по /context", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ path: "/context" }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при path /context").toBe(true)
  })

  it("фильтрация по /state", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ path: "/state" }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "active" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при path /state").toBe(true)
  })

  it("фильтрация по /", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ path: "/" }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "add", path: "/", value: { context: {}, state: "idle" } },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при path /").toBe(true)
  })

  it("не срабатывает при несовпадении пути", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({ path: "/context" }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "active" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция не должна сработать при несовпадении пути").toBe(false)
  })

  it("комбинированная фильтрация с операцией", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/context",
              op: "replace",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при комбинированной фильтрации").toBe(true)
  })

  it("комбинированная фильтрация с метой", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/context",
              meta: "test",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при комбинированной фильтрации с тегом").toBe(true)
  })

  it("фильтрация по /context с replace", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/context",
              op: "replace",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при /context с replace").toBe(true)
  })

  it("фильтрация по /context с add", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/context",
              op: "add",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "add", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при /context с add").toBe(true)
  })

  it("фильтрация по /context с remove", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/context",
              op: "remove",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "remove", path: "/context" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при /context с remove").toBe(true)
  })

  it("фильтрация по /context с test", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/context",
              op: "test",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "test", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при /context с test").toBe(true)
  })

  it("фильтрация по /state с replace", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/state",
              op: "replace",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "replace", path: "/state", value: "active" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при /state с replace").toBe(true)
  })

  it("фильтрация по / с add", () => {
    const core: { called: boolean } = { called: false }
    const registry = reactionsFromSchema(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ label: "test" })
            .filter(({ self }) => ({
              path: "/",
              op: "add",
            }))
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: "id",
      timestamp: Date.now(),
      patch: { op: "add", path: "/", value: { context: {}, state: "idle" } },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
        self: { meta: "test", actor: "test-actor", path: "0" },
    })

    expect(core.called, "реакция должна сработать при / с add").toBe(true)
  })
})
