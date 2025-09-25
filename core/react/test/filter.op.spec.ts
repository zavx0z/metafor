import { deserializeReactions } from "../index"
import type { Update, Values } from "@zavx0z/context"
import { describe, it, expect } from "bun:test"
import type { JsonPatch } from "../../index.t"
import { reactionsSchema } from "../../../schema/reactions"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по операции патча (op)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10 }
  const fakeMeta: string = "test"

  it("фильтрация по replace", () => {
    const core: { called: boolean } = { called: false }
    const registry = deserializeReactions(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ title: "test" })
            .filter({ op: "replace" })
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
    })

    expect(core.called, "реакция должна сработать при replace операции").toBe(true)
  })

  it("фильтрация по add", () => {
    const core: { called: boolean } = { called: false }
    const registry = deserializeReactions(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ title: "test" })
            .filter({ op: "add" })
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "add", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
    })

    expect(core.called, "реакция должна сработать при add операции").toBe(true)
  })

  it("фильтрация по remove", () => {
    const core: { called: boolean } = { called: false }
    const registry = deserializeReactions(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ title: "test" })
            .filter({ op: "remove" })
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "remove", path: "/context" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
    })

    expect(core.called, "реакция должна сработать при remove операции").toBe(true)
  })

  it("фильтрация по test", () => {
    const core: { called: boolean } = { called: false }
    const registry = deserializeReactions(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ title: "test" })
            .filter({ op: "test" })
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "test", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
    })

    expect(core.called, "реакция должна сработать при test операции").toBe(true)
  })

  it("не срабатывает при несовпадении операции", () => {
    const core: { called: boolean } = { called: false }
    const registry = deserializeReactions(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ title: "test" })
            .filter({ op: "replace" })
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "add", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
    })

    expect(core.called, "реакция не должна сработать при несовпадении операции").toBe(false)
  })

  it("комбинированная фильтрация с другими условиями", () => {
    const core: { called: boolean } = { called: false }
    const registry = deserializeReactions(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ title: "test" })
            .filter({
              op: "replace",
              path: "/context",
              meta: "test",
            })
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
    })

    expect(core.called, "реакция должна сработать при комбинированной фильтрации").toBe(true)
  })

  it("фильтрация по replace с path", () => {
    const core: { called: boolean } = { called: false }
    const registry = deserializeReactions(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ title: "test" })
            .filter({
              op: "replace",
              path: "/context",
            })
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
    })

    expect(core.called, "реакция должна сработать при replace с path").toBe(true)
  })

  it("фильтрация по add с path", () => {
    const core: { called: boolean } = { called: false }
    const registry = deserializeReactions(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ title: "test" })
            .filter({
              op: "add",
              path: "/context",
            })
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "add", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
    })

    expect(core.called, "реакция должна сработать при add с path").toBe(true)
  })

  it("фильтрация по remove с path", () => {
    const core: { called: boolean } = { called: false }
    const registry = deserializeReactions(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ title: "test" })
            .filter({
              op: "remove",
              path: "/context",
            })
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "remove", path: "/context" },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
    })

    expect(core.called, "реакция должна сработать при remove с path").toBe(true)
  })

  it("фильтрация по test с path", () => {
    const core: { called: boolean } = { called: false }
    const registry = deserializeReactions(
      reactionsSchema<{}, State, { called: boolean }>((reaction) => [
        [
          ["idle"],
          reaction({ title: "test" })
            .filter({
              op: "test",
              path: "/context",
            })
            .equal(({ core }) => (core.called = true)),
        ],
      ]) as any
    )

    registry.run({
      meta: fakeMeta,
      actor: { index: 0 },
      timestamp: Date.now(),
      patch: { op: "test", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core,
      update: fakeUpdate,
    })

    expect(core.called, "реакция должна сработать при test с path").toBe(true)
  })
})
