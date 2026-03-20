import { describe, expect, test } from "bun:test"

import { createFieldValueResolver, resolveFieldValues, resolveNodeFieldValues } from "./fields.ts"

describe("strong field resolvers", () => {
  test("сохраняют falsy default values из AST", () => {
    const values = resolveFieldValues({
      title: {
        type: "string",
        required: true,
        default: "",
      },
      count: {
        type: "number",
        default: 0,
      },
      active: {
        type: "boolean",
        default: false,
      },
      items: {
        type: "array<string>",
        default: [],
      },
      mode: {
        type: "enum<string>",
        values: ["a", "b"],
        default: "a",
      },
    })

    expect(values, "field resolvers должны сохранять сериализованные falsy/default значения как есть").toEqual({
      title: "",
      count: 0,
      active: false,
      items: [],
      mode: "a",
    })
  })

  test("ставят null для optional field без default", () => {
    const value = createFieldValueResolver("error", {
      type: "string",
    })()

    expect(value, "optional field без default должен стартовать как null").toBeNull()
  })

  test("падают на required field без default", () => {
    const resolve = createFieldValueResolver("command", {
      type: "string",
      required: true,
    })

    expect(resolve, "required field без default должен падать явно").toThrow(
      'Field "command" is required but has no default',
    )
  })

  test("вычисляют continuation fields из node.fields AST", () => {
    const resolvers = new Map([
      ["operation", () => null],
      ["args", () => null],
      ["error", () => null],
    ])

    const values = resolveNodeFieldValues(
      {
        data: ["/value/operation", "/value/args"],
        expr: "{ operation: _[0], args: _[1] }",
      },
      resolvers,
    )
    const errorValues = resolveNodeFieldValues(
      {
        data: "/value/error",
        expr: "{ message: _[0] }",
      },
      resolvers,
    )

    expect(values, "node.fields AST должен вычисляться в runtime object через field resolvers").toEqual({
      operation: null,
      args: null,
    })
    expect(errorValues, "single field path должен вычисляться в runtime object через expr").toEqual({
      message: null,
    })
  })
})
