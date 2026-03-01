import { reactionsFromSchema } from "../../src/reactions"
import { contextSchema } from "@zavx0z/context"
import { test, expect } from "bun:test"
import { reactionsSchema } from "../../../dsl/meta/reactions"

const schema = contextSchema((field) => ({
  value: field.number.required(0),
  name: field.string.required(""),
  isActive: field.boolean.required(false),
  tags: field.array.required([]),
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
            path: "/fields",
            value: 1,
          }))
          .equal(({ update, fields }) => update({ value: fields.value + 1 })),
      ],
      [
        ["error"],
        reaction({ label: "reset" })
          .filter(({ self }) => ({ meta: "any" }))
          .equal(({ update }) => update({ value: 0 })),
      ],
    ]) as any
  )

  const all = registry.getAll()
  expect(all?.length, "уникальные реакции").toBe(2)
  expect(all?.[0]?.label, "первая реакция").toBe("inc")
  expect(all?.[1]?.label, "вторая реакция").toBe("reset")
})
