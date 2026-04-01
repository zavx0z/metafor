import { describe, expect, test } from "bun:test"
import { fieldSchema } from "../../fields.ts"

describe("fieldSchema", () => {
  test("сохраняет только минимальную схему и метаданные", () => {
    const schema = fieldSchema((field) => ({
      id: field.string.required("meta-id", { id: true, label: "ID" }),
      role: field.enum("user", "admin").required("user", { id: true }),
      tags: field.array.required<string>([], { label: "Теги", data: "meta_tags" }),
      age: field.number.optional(),
    }))

    expect(schema).toEqual({
      id: { type: "string", required: true, default: "meta-id", id: true, label: "ID" },
      role: { type: "enum", required: true, default: "user", values: ["user", "admin"], id: true },
      tags: { type: "array", required: true, default: [], label: "Теги", data: "meta_tags" },
      age: { type: "number" },
    })
  })

  test("required-поля без default отсекаются runtime-проверкой", () => {
    expect(() =>
      fieldSchema((field) => ({
        // @ts-expect-error intentional runtime guard check
        broken: field.string.required(),
      })),
    ).toThrow("Обязательное поле broken должно иметь значение по умолчанию")
  })
})
