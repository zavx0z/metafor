import { Reactions } from "../index"
import type { Update, Values } from "@zavx0z/context"
import { test, expect } from "bun:test"
import type { Message, JsonPatch } from "../../message"
import { Context } from "@zavx0z/context"

const { schema } = new Context((t) => ({
  value: t.number.required(0),
  name: t.string.required(""),
  isActive: t.boolean.required(false),
  tags: t.array.required([]),
}))
type Ctx = typeof schema
type State = "idle" | "active" | "error"

test("Выполнение реакций через run", () => {
  let called = false
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10, name: "test", isActive: true, tags: ["tag1", "tag2"] } as any
  const fakeMessage: Message = {
    meta: "test",
    actor: { index: 0 },
    timestamp: Date.now(),
    patches: [{ op: "replace", path: "/context", value: 1 }],
  }

  const registry = new Reactions<Ctx, State>((reaction) => [
    [
      ["active"],
      reaction({ title: "test" })
        .filter({ meta: "test" })
        .equal(() => (called = true)),
    ],
  ])

  registry.run({
    meta: fakeMessage.meta,
    actor: fakeMessage.actor,
    timestamp: fakeMessage.timestamp,
    patch: fakeMessage.patches[0] as JsonPatch,
    context: fakeContext,
    state: "active",
    core: {},
    update: fakeUpdate,
  })

  expect(called, "реакция вызвана").toBe(true)
})
