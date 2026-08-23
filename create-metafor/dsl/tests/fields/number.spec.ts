import { describe, expect, test } from "bun:test"
import { fieldSchema } from "../../fields.ts"

describe("field.number", () => {
  test("строит number-поля с optional/required и label", () => {
    const schema = fieldSchema((field) => ({
      short: field.number.optional(),
      withLabel: field.number.optional({ label: "Число" }),
      withDefault: field.number.optional(4),
      required: field.number.required(1),
      requiredWithLabel: field.number.required(7, { label: "Счетчик" }),
    }))

    expect(schema).toEqual({
      short: { type: "number" },
      withLabel: { type: "number", label: "Число" },
      withDefault: { type: "number", default: 4 },
      required: { type: "number", required: true, default: 1 },
      requiredWithLabel: { type: "number", required: true, default: 7, label: "Счетчик" },
    })
  })
})
