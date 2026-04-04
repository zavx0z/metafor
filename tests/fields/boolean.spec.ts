import { describe, expect, test } from "bun:test"
import { fieldSchema } from "../../fields.ts"

describe("field.boolean", () => {
  test("строит boolean-поля с optional/required и label", () => {
    const schema = fieldSchema((field) => ({
      short: field.boolean.optional(),
      withLabel: field.boolean.optional({ label: "Флаг" }),
      withDefault: field.boolean.optional(true),
      required: field.boolean.required(false),
      requiredWithLabel: field.boolean.required(true, { label: "Активен" }),
    }))

    expect(schema).toEqual({
      short: { type: "boolean" },
      withLabel: { type: "boolean", label: "Флаг" },
      withDefault: { type: "boolean", default: true },
      required: { type: "boolean", required: true, default: false },
      requiredWithLabel: { type: "boolean", required: true, default: true, label: "Активен" },
    })
  })
})
