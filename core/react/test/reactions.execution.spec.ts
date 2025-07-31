import { ReactionRegistry } from "../index"
import type { Update, ExtractValues } from "../../context/index.t"
import { test, expect } from "bun:test"
import type { JsonPatch, MetaDataMessage } from "../../message"

type Ctx = {
  value: { type: "number"; required: true }
  name: { type: "string"; required: true }
  isActive: { type: "boolean"; required: true }
  tags: { type: "array"; required: true }
}
type State = "idle" | "active" | "error"

test("Выполнение реакций через run", () => {
  let called = false
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: ExtractValues<Ctx> = { value: 10, name: "test", isActive: true, tags: ["tag1", "tag2"] }
  const fakeMeta: MetaDataMessage = { tag: "test", index: 0 }
  const fakePatch: JsonPatch = { op: "replace", path: "/context", value: 1 }

  const registry = new ReactionRegistry<Ctx, State>((reaction) => [
    [
      ["active"],
      reaction({ title: "test" })
        .filter({ tag: "test" })
        .equal(() => (called = true)),
    ],
  ])

  registry.run({
    meta: fakeMeta,
    patch: fakePatch,
    context: fakeContext,
    state: "active",
    core: {},
    update: fakeUpdate,
  })

  expect(called, "реакция вызвана").toBe(true)
})
