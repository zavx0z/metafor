import { describe, expect, test } from "bun:test"
import { fieldSchema } from "../../fields.ts"

describe("field.enum", () => {
  test("строит enum-поля только со строковыми вариантами", () => {
    const schema = fieldSchema((field) => ({
      optional: field.enum("user", "admin").optional("user"),
      optionalWithLabel: field.enum("idle", "done").optional({ label: "Режим" }),
      required: field.enum("draft", "published").required("draft"),
    }))

    expect(schema).toEqual({
      optional: { type: "enum", default: "user", values: ["user", "admin"] },
      optionalWithLabel: { type: "enum", label: "Режим", values: ["idle", "done"] },
      required: { type: "enum", required: true, default: "draft", values: ["draft", "published"] },
    })
  })

  test("отсекает пустой enum как legacy-хвост topology", () => {
    expect(() =>
      fieldSchema((field) => ({
        // @ts-expect-error intentional runtime guard check
        empty: field.enum().optional(),
      })),
    ).toThrow('Topology field empty with type "enum" must declare non-empty string values')
  })
})
