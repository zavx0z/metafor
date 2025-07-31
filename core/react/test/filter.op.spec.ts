import { ReactionRegistry, createReactionsChain } from "../index"
import type { Update, ExtractValues } from "../../context/index.t"
import { describe, it, expect } from "bun:test"
import type { JsonPatch, MetaDataMessage } from "../../message"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по операции патча (op)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: ExtractValues<Ctx> = { value: 10 }
  const fakeMeta: MetaDataMessage = { tag: "test", index: 0 }

  it("фильтрация по replace", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ op: "replace" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при replace операции").toBe(true)
  })

  it("фильтрация по add", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ op: "add" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "add", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при add операции").toBe(true)
  })

  it("фильтрация по remove", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ op: "remove" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "remove", path: "/context" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при remove операции").toBe(true)
  })

  it("фильтрация по test", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ op: "test" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "test", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при test операции").toBe(true)
  })

  it("не срабатывает при несовпадении операции", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ op: "replace" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "add", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция не должна сработать при несовпадении операции").toBe(false)
  })

  it("комбинированная фильтрация с другими условиями", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            op: "replace",
            path: "/context",
            tag: "test",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при комбинированной фильтрации").toBe(true)
  })

  it("фильтрация по replace с path", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            op: "replace",
            path: "/context",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при replace с path").toBe(true)
  })

  it("фильтрация по add с path", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            op: "add",
            path: "/context",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "add", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при add с path").toBe(true)
  })

  it("фильтрация по remove с path", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            op: "remove",
            path: "/context",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "remove", path: "/context" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при remove с path").toBe(true)
  })

  it("фильтрация по test с path", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            op: "test",
            path: "/context",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "test", path: "/context", value: 1 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при test с path").toBe(true)
  })
})
