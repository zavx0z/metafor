import { Reactions } from "../index"
import type { Update, ExtractValues } from "../../context/index.t"
import { test, expect } from "bun:test"
import type { Message } from "../../message"

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
    patch: fakeMessage.patch,
    context: fakeContext,
    state: "active",
    core: {},
    update: fakeUpdate,
  })

  expect(called, "реакция вызвана").toBe(true)
})
