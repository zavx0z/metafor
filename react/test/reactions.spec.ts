import { ReactionRegistry, createReactionsChain } from "../index"
import type { Update, ExtractValues } from "../../context/index.t"
import { describe, it, expect } from "bun:test"
import type { JsonPatch, MetaDataMessage } from "../../message"

type Ctx = {
  value: { type: "number"; required: true }
  name: { type: "string"; required: true }
  isActive: { type: "boolean"; required: true }
  tags: { type: "array"; required: true }
}
type State = "idle" | "active" | "error"

describe("ReactionRegistry", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  // fakeContext должен быть типа ExtractValues<Ctx>, а не Ctx
  const fakeContext: ExtractValues<Ctx> = { value: 10, name: "test", isActive: true, tags: ["tag1", "tag2"] }
  const fakeMeta: MetaDataMessage = { tag: "test", index: 0 }
  const fakePatch: JsonPatch = { op: "replace", path: "/context", value: 1 }

  it("создаёт уникальные реакции", () => {
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle", "active"],
        reaction({ title: "inc" })
          .filter({
            tag: "test",
            op: "replace",
            path: "/context",
            value: 1,
          })
          .equal(({ update, context }) => update({ value: context.value + 1 })),
      ],
      [
        ["error"],
        reaction({ title: "reset" })
          .filter({ tag: "any" })
          .equal(({ update }) => update({ value: 0 })),
      ],
    ])

    const all = registry.getAllReactions()
    expect(all?.length, "уникальные реакции").toBe(2)
    expect(all?.[0]?.title, "первая реакция").toBe("inc")
    expect(all?.[1]?.title, "вторая реакция").toBe("reset")
  })

  it("находит реакции по состоянию", () => {
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle", "active"],
        reaction({ title: "inc" })
          .filter({ tag: "test" })
          .equal(({ update, context }) => update({ value: context.value + 1 })),
      ],
      [
        ["error"],
        reaction({ title: "reset" })
          .filter({ tag: "any" })
          .equal(({ update }) => update({ value: 0 })),
      ],
    ])

    const idle = registry.getReactions("idle")
    expect(idle?.length, "idle реакции").toBe(1)
    expect(idle?.[0]?.title, "idle title").toBe("inc")

    const error = registry.getReactions("error")
    expect(error?.length, "error реакции").toBe(1)
    expect(error?.[0]?.title, "error title").toBe("reset")
  })

  it("исполняет реакции через run", () => {
    let called = false
    const customRegistry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["active"],
        reaction({ title: "test" })
          .filter({ tag: "test" })
          .equal(() => (called = true)),
      ],
    ])

    customRegistry.run({
      meta: fakeMeta,
      patch: fakePatch,
      context: fakeContext,
      state: "active",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "реакция вызвана").toBe(true)
  })

  it("сериализует структуру", () => {
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle", "active"],
        reaction({ title: "inc" })
          .filter({ tag: "test" })
          .equal(({ update, context }) => update({ value: context.value + 1 })),
      ],
      [
        ["error"],
        reaction({ title: "reset" })
          .filter({ tag: "any" })
          .equal(({ update }) => update({ value: 0 })),
      ],
    ])

    const json = registry.toJSON()
    expect(Array.isArray(json.reactions), "reactions массив").toBe(true)
    expect(typeof json.states, "states объект").toBe("object")
  })

  it("поддерживает сложные условия фильтрации", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle", "active"],
        reaction({ title: "complex_filter" })
          .filter({
            tag: { startsWith: "test" },
            index: { gt: 0 },
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: { tag: "test_component", index: 5 },
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "сложная фильтрация работает").toBe(true)
  })

  it("поддерживает числовые условия фильтрации", () => {
    let called = false
    const registry = new ReactionRegistry<Ctx, State>((reaction) => [
      [
        ["idle", "active"],
        reaction({ title: "number_filter" })
          .filter({
            index: { gte: 5, lt: 10 },
            timestamp: { between: [1000, 2000] },
          })
          .equal(() => (called = true)),
      ],
    ])

    registry.run({
      meta: { tag: "test", index: 7, timestamp: 1500 },
      patch: fakePatch,
      context: fakeContext,
      state: "idle",
      core: {},
      update: fakeUpdate,
    })

    expect(called, "числовая фильтрация работает").toBe(true)
  })
})
