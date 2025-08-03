import { Reactions } from "../index"
import { test, expect } from "bun:test"

type Ctx = {
  value: { type: "number"; required: true }
  name: { type: "string"; required: true }
  isActive: { type: "boolean"; required: true }
  tags: { type: "array"; required: true }
}
type State = "idle" | "active" | "error"

test("Создание уникальных реакций", () => {
  const registry = new Reactions<Ctx, State>((reaction) => [
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
