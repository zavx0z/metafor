import { ReactionRegistry, createReactionsChain } from "../index"
import type { Update, ExtractValues } from "../../context/index.t"
import { describe, it, expect } from "bun:test"

// Типы для meta и patch
import type { MetaDataMessage, JsonPatch } from "../../message/index.t"

type Ctx = { value: { type: "number"; required: true } }
type State = "idle" | "active" | "error"

describe("ReactionRegistry", () => {
  const fakeUpdate: Update<Ctx> = (values) => values as any
  // fakeContext должен быть типа ExtractValues<Ctx>, а не Ctx
  const fakeContext: ExtractValues<Ctx> = { value: 10 }
  const fakeMeta: MetaDataMessage = { tag: "test" } as MetaDataMessage
  const fakePatch: JsonPatch = [{ op: "replace", path: "/value", value: 1 }] as any

  it("создаёт уникальные реакции", () => {
    const registry = new ReactionRegistry<Ctx, State>((filter) => [
      [
        ["idle", "active"],
        filter(() => true).equal(({ update, context }) => {
          update({ value: context.value + 1 })
        }, "inc"),
      ],
      [
        ["error"],
        filter(() => true).equal(({ context }) => {
          context.value = 0
        }, "reset"),
      ],
    ])

    const all = registry.getAllReactions()
    expect(all?.length, "уникальные реакции").toBe(2)
    expect(all?.[0]?.title, "первая реакция").toBe("inc")
    expect(all?.[1]?.title, "вторая реакция").toBe("reset")
  })

  it("находит реакции по состоянию", () => {
    const registry = new ReactionRegistry<Ctx, State>((filter) => [
      [
        ["idle", "active"],
        filter(() => true).equal(({ update, context }) => {
          update({ value: context.value + 1 })
        }, "inc"),
      ],
      [
        ["error"],
        filter(() => true).equal(({ context }) => {
          context.value = 0
        }, "reset"),
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
    const customRegistry = new ReactionRegistry<Ctx, State>((filter) => [
      [
        ["active"],
        filter(() => true).equal(() => {
          called = true
        }, "test"),
      ],
    ])

    customRegistry.run({
      meta: fakeMeta,
      patch: fakePatch,
      context: fakeContext as any,
      state: "active",
      update: fakeUpdate,
      core: {},
    })
    expect(called, "run вызывает update").toBe(true)
  })

  it("сериализует структуру", () => {
    const registry = new ReactionRegistry<Ctx, State>((filter) => [
      [
        ["idle", "active"],
        filter(() => true).equal(({ update, context }) => {
          update({ value: context.value + 1 })
        }, "inc"),
      ],
      [
        ["error"],
        filter(() => true).equal(({ context }) => {
          context.value = 0
        }, "reset"),
      ],
    ])

    const json = registry.toJSON()
    expect(Array.isArray(json.reactions), "reactions массив").toBe(true)
    expect(typeof json.states, "states объект").toBe("object")
    expect(Object.keys(json.states).length, "кол-во состояний").toBe(3)
  })
})
