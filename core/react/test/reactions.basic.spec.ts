import { deserializeReactions } from "../index"
import { contextSchema } from "@zavx0z/context"
import { test, expect } from "bun:test"
import { reactionsSchema } from "../../../schema/reactions"

const schema = contextSchema((t) => ({
  value: t.number.required(0),
  name: t.string.required(""),
  isActive: t.boolean.required(false),
  tags: t.array.required([]),
}))
type Ctx = typeof schema
type State = "idle" | "active" | "error"

test("Создание уникальных реакций", () => {
  const registry = deserializeReactions<Ctx, State, {}>(
    reactionsSchema<Ctx, State, {}>((reaction) => [
      [
        ["idle", "active"],
        reaction({ title: "inc" })
          .filter({
            meta: "test",
            op: "replace",
            path: "/context",
            value: 1,
          })
          .equal(({ update, context }) => update({ value: context.value + 1 })),
      ],
      [
        ["error"],
        reaction({ title: "reset" })
          .filter({ meta: "any" })
          .equal(({ update }) => update({ value: 0 })),
      ],
    ]) as any
  )

  const all = registry.getAllReactions()
  expect(all?.length, "уникальные реакции").toBe(2)
  expect(all?.[0]?.title, "первая реакция").toBe("inc")
  expect(all?.[1]?.title, "вторая реакция").toBe("reset")
})
