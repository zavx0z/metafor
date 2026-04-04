import { describe, expect, test } from "bun:test"
import { fieldSchema } from "../../fields.ts"

describe("field.array", () => {
  test("строит array-поля как topology number[] с data, label и default", () => {
    const schema = fieldSchema((field) => ({
      short: field.array.optional(),
      withLabel: field.array.optional({ label: "Теги" }),
      withData: field.array.optional({ data: "user_tags" }),
      withDefault: field.array.optional([1, 2]),
      required: field.array.required([1, 2, 3]),
      requiredWithMeta: field.array.required([], { label: "Имена", data: "names" }),
    }))

    expect(schema).toEqual({
      short: { type: "array" },
      withLabel: { type: "array", label: "Теги" },
      withData: { type: "array", data: "user_tags" },
      withDefault: { type: "array", default: [1, 2] },
      required: { type: "array", required: true, default: [1, 2, 3] },
      requiredWithMeta: { type: "array", required: true, default: [], label: "Имена", data: "names" },
    })
  })

  test("отсекает string[] как legacy-хвост topology array", () => {
    expect(() =>
      fieldSchema((field) => ({
        // @ts-expect-error intentional runtime guard check
        legacy: field.array.optional(["a", "b"]),
      })),
    ).toThrow('Topology field legacy with type "array" must use number[] as runtime value')
  })
})
