import { describe, expect, test } from "bun:test"
import { fieldSchema } from "../../fields.ts"

describe("field.enum", () => {
  test("строит enum-поля со строковыми и числовыми вариантами", () => {
    const schema = fieldSchema((field) => ({
      empty: field.enum().optional(),
      optional: field.enum("user", "admin").optional("user"),
      optionalWithLabel: field.enum("idle", "done").optional({ label: "Режим" }),
      required: field.enum("draft", "published").required("draft"),
      requiredNumeric: field.enum(1, 2, 3).required(2, { label: "Приоритет" }),
    }))

    expect(schema).toEqual({
      empty: { type: "enum" },
      optional: { type: "enum", default: "user", values: ["user", "admin"] },
      optionalWithLabel: { type: "enum", label: "Режим", values: ["idle", "done"] },
      required: { type: "enum", required: true, default: "draft", values: ["draft", "published"] },
      requiredNumeric: { type: "enum", required: true, default: 2, label: "Приоритет", values: [1, 2, 3] },
    })
  })
})
