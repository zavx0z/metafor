import { describe, expect, test } from "bun:test"
import { fieldSchema } from "../../fields.ts"
import type { FieldType, Update, Values } from "../../fields.t.ts"

describe("field typing", () => {
  test("сохраняет инференс SchemaType, Values и Update", () => {
    const schema = fieldSchema((field) => ({
      name: field.string.required("guest", { id: true, label: "Имя" }),
      age: field.number.optional(),
      active: field.boolean.required(false),
      tags: field.array.required<string>([], { data: "user_tags" }),
      role: field.enum("user", "admin").required("user"),
      mode: field.enum("idle", "done").optional(),
    }))

    const nameField: FieldType<"string", true, string> = schema.name
    const values: Values<typeof schema> = {
      name: "meta",
      age: null,
      active: true,
      tags: ["a", "b"],
      role: "admin",
      mode: null,
    }
    const update: Update<typeof schema> = (next) => next

    expect(nameField.default).toBe("guest")
    expect(update({ age: 3, mode: "idle" })).toEqual({ age: 3, mode: "idle" })
    expect(values.tags).toEqual(["a", "b"])

    // @ts-expect-error required string cannot be null
    update({ name: null })
    // @ts-expect-error enum keeps literal union
    update({ role: "guest" })
    // @ts-expect-error array element type follows generic
    update({ tags: [1, 2, 3] })
    // @ts-expect-error optional enum still keeps literal union plus null
    const invalidValues: Values<typeof schema> = { ...values, mode: "draft" }
    void invalidValues
  })
})
