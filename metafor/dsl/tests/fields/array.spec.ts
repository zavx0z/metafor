import { describe, expect, test } from "bun:test"
import { fieldSchema } from "../../fields.ts"

describe("field.array", () => {
  test("строит array-поля с data, label и default", () => {
    const schema = fieldSchema((field) => ({
      short: field.array.optional(),
      withLabel: field.array.optional({ label: "Теги" }),
      withData: field.array.optional({ data: "user_tags" }),
      withDefault: field.array.optional(["a", "b"]),
      required: field.array.required<number>([1, 2, 3]),
      requiredWithMeta: field.array.required<string>([], { label: "Имена", data: "names" }),
    }))

    expect(schema).toEqual({
      short: { type: "array" },
      withLabel: { type: "array", label: "Теги" },
      withData: { type: "array", data: "user_tags" },
      withDefault: { type: "array", default: ["a", "b"] },
      required: { type: "array", required: true, default: [1, 2, 3] },
      requiredWithMeta: { type: "array", required: true, default: [], label: "Имена", data: "names" },
    })
  })
})
