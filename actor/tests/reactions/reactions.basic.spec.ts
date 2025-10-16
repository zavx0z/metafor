import { reactionsFromSchema } from "../../week/reactions"
import { contextSchema } from "@zavx0z/context"
import { test, expect } from "bun:test"
import { reactionsSchema } from "../../../meta/reactions"

const schema = contextSchema((t) => ({
  value: t.number.required(0),
  name: t.string.required(""),
  isActive: t.boolean.required(false),
  tags: t.array.required([]),
}))
type State = "idle" | "active" | "error"

test("Создание уникальных реакций", () => {
  const registry = reactionsFromSchema<typeof schema, State, {}>(
    reactionsSchema<typeof schema, State, {}>((reaction) => [
      [
        ["idle", "active"],
        reaction({ label: "inc" })
          .filter(({ self }) => ({
            meta: "test",
            op: "replace",
            path: "/context",
            value: 1,
          }))
          .equal(({ update, context }) => update({ value: context.value + 1 })),
      ],
      [
        ["error"],
        reaction({ label: "reset" })
          .filter(({ self }) => ({ meta: "any" }))
          .equal(({ update }) => update({ value: 0 })),
      ],
    ]) as any
  )

  const all = registry.getAllReactions()
  expect(all?.length, "уникальные реакции").toBe(2)
  expect(all?.[0]?.label, "первая реакция").toBe("inc")
  expect(all?.[1]?.label, "вторая реакция").toBe("reset")
})
