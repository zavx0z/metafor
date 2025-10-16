import { reactionsFromSchema } from "../../week/reactions"
import type { Update, Values } from "@zavx0z/context"
import { test, expect } from "bun:test"
import type { JsonPatch } from "../../electromagnetic/electromagnetic.t"
import type { Message } from "../../electromagnetic/electromagnetic.t"
import { contextSchema } from "@zavx0z/context"
import { reactionsSchema } from "../../../meta/reactions"

const schema = contextSchema((t) => ({
  value: t.number.required(0),
  name: t.string.required(""),
  isActive: t.boolean.required(false),
  tags: t.array.required([]),
}))
type Ctx = typeof schema
type State = "idle" | "active" | "error"

test("Выполнение реакций через run", () => {
  const core: { called: boolean } = { called: false }
  const fakeUpdate: Update<Ctx> = (values) => values as any
  const fakeContext: Values<Ctx> = { value: 10, name: "test", isActive: true, tags: ["tag1", "tag2"] } as any
  const fakeMessage: Message = {
    meta: "test",
    actor: "id",
    timestamp: Date.now(),
    patches: [{ op: "replace", path: "/context", value: 1 }],
  }

  const registry = reactionsFromSchema<Ctx, State, {}>(
    reactionsSchema<Ctx, State, typeof core>((reaction) => [
      [
        ["active"],
        reaction({ label: "test" })
          .filter(({ self }) => ({ meta: "test" }))
          .equal(({ core }) => (core.called = true)),
      ],
    ]) as any
  )

  registry.run({
    meta: fakeMessage.meta,
    actor: fakeMessage.actor,
    timestamp: fakeMessage.timestamp,
    patch: fakeMessage.patches[0] as JsonPatch,
    context: fakeContext,
    state: "active",
    core,
    update: fakeUpdate,
    self: { meta: "test", actor: "test-actor", path: "0" },
  })

  expect(core.called, "реакция вызвана").toBe(true)
})
