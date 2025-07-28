import { ReactionRegistry, createReactionsChain } from "../index"
import type { Update, ExtractValues } from "../../context/index.t"
import { describe, it, expect } from "bun:test"
import type { JsonPatch, MetaDataMessage } from "../../message"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active"

describe("Фильтрация по значению патча (value)", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: ExtractValues<Ctx> = { value: 10 }
  const fakeMeta: MetaDataMessage = { tag: "test", index: 0 }

  it("фильтрация по строковому значению", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: "active" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/state", value: "active" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при строковом значении").toBe(true)
  })

  it("фильтрация по числовому значению", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: 42 })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: 42 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при числовом значении").toBe(true)
  })

  it("фильтрация по булевому значению", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: true })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: true },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при булевом значении").toBe(true)
  })

  it("фильтрация по null значению", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: null })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: null },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при null значении").toBe(true)
  })

  it("фильтрация по объекту", () => {
    let called = false
    const testObject = { name: "test", value: 42 }
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: testObject })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: testObject },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при объектном значении").toBe(true)
  })

  it("фильтрация по массиву", () => {
    let called = false
    const testArray = [1, 2, 3]
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: testArray })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: testArray },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при массиве").toBe(true)
  })

  it("не срабатывает при несовпадении значения", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: "active" })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/state", value: "idle" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция не должна сработать при несовпадении значения").toBe(false)
  })

  it("комбинированная фильтрация с операцией", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            value: "active",
            op: "replace",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/state", value: "active" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при комбинированной фильтрации").toBe(true)
  })

  it("комбинированная фильтрация с путем", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            value: "active",
            path: "/state",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/state", value: "active" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при комбинированной фильтрации с путем").toBe(true)
  })

  it("фильтрация по значению с /context", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            value: 42,
            path: "/context",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: 42 },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при значении с /context").toBe(true)
  })

  it("фильтрация по значению с /state", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({
            value: "active",
            path: "/state",
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/state", value: "active" },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при значении с /state").toBe(true)
  })

  it("фильтрация по сложному объекту", () => {
    let called = false
    const complexObject = {
      user: {
        id: 1,
        name: "John",
        settings: {
          theme: "dark",
          notifications: true,
        },
      },
    }
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: complexObject })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: complexObject },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при сложном объекте").toBe(true)
  })

  it("фильтрация по вложенному массиву", () => {
    let called = false
    const nestedArray = [
      { id: 1, name: "item1" },
      { id: 2, name: "item2" },
    ]
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: nestedArray })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: nestedArray },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при вложенном массиве").toBe(true)
  })

  it("фильтрация по undefined значению", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: undefined })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: undefined },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при undefined значении").toBe(true)
  })

  it("фильтрация по функции (не должна сработать)", () => {
    let called = false
    const testFunction = () => "test"
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle"],
        reaction({ title: "test" })
          .filter({ value: testFunction })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: fakeMeta,
      patch: { op: "replace", path: "/context", value: testFunction },
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция должна сработать при функции").toBe(true)
  })
}) 