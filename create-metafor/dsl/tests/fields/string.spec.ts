import { describe, expect, test } from "bun:test"
import { fieldSchema } from "../../fields.ts"

describe("field.string", () => {
  test("строит string-поля с optional/required и label", () => {
    const schema = fieldSchema((field) => ({
      short: field.string.optional(),
      withLabel: field.string.optional({ label: "Строка" }),
      withDefault: field.string.optional("demo"),
      required: field.string.required("value"),
      requiredWithLabel: field.string.required("named", { label: "Имя" }),
    }))

    expect(schema).toEqual({
      short: { type: "string" },
      withLabel: { type: "string", label: "Строка" },
      withDefault: { type: "string", default: "demo" },
      required: { type: "string", required: true, default: "value" },
      requiredWithLabel: { type: "string", required: true, default: "named", label: "Имя" },
    })
  })
})
