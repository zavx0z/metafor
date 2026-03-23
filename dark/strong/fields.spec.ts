import { describe, expect, test } from "bun:test"
import { Wimp } from "@dark/strong"
import {
  createFieldValueResolver,
  materializeFields,
  readFieldValues,
  resolveFieldValues,
  resolveNodeFieldInits,
  resolveNodeFieldValues,
} from "./fields.ts"

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

  test("materialize-ят объектные Field с owner, schema, value и source", () => {
    const parent = new Wimp({ src: "zavx0z/git", parent: null })
    parent.fields = materializeFields(parent, {
      args: {
        type: "string",
      },
    })
    if (!parent.fields?.args) throw new Error("args field is not found")
    parent.fields.args.value = "--help"

    const child = new Wimp({ src: "zavx0z/git-start", parent: parent })
    child.fields = materializeFields(
      child,
      {
        args: {
          type: "string",
        },
        operation: {
          type: "enum<string>",
          values: ["clone", "init"],
        },
      },
      [
        { key: "args", value: "--help", source: parent.fields.args },
        { key: "operation", value: null, source: parent.fields.args },
      ],
    )

    expect(child.fields.args.owner, "Field должен знать владельца").toBe(child)
    expect(child.fields.args.schema, "Field должен хранить schema").toEqual({ type: "string" })
    expect(child.fields.args.value, "Field должен хранить runtime value").toBe("--help")
    expect(child.fields.args.source, "ordinary field должен ссылаться на parent Field").toBe(parent.fields.args)
    expect(
      child.fields.operation.source,
      "enum field не должен смешиваться с ordinary source-linking даже если init принёс source",
    ).toBeNull()
    expect(readFieldValues(child.fields)).toEqual({ args: "--help", operation: null })
  })

  test("resolveNodeFieldInits сохраняет direct source links только для ordinary fields", () => {
    const parent = new Wimp({ src: "zavx0z/git", parent: null })
    parent.fields = materializeFields(parent, {
      args: {
        type: "string",
      },
      operation: {
        type: "enum<string>",
        values: ["clone", "init"],
      },
      items: {
        type: "array<string>",
        default: [],
      },
    })

    const ordinaryInits = resolveNodeFieldInits(
      {
        data: ["/value/operation", "/value/args"],
        expr: "{ operation: _[0], args: _[1] }",
      },
      parent.fields,
    )
    const arrayInits = resolveNodeFieldInits(
      {
        data: "/value/items",
        expr: "{ items: _[0] }",
      },
      parent.fields,
    )

    expect(ordinaryInits?.find((fieldInit) => fieldInit.key === "operation")?.source).toBeUndefined()
    expect(ordinaryInits?.find((fieldInit) => fieldInit.key === "args")?.source).toBe(parent.fields.args)
    expect(arrayInits?.find((fieldInit) => fieldInit.key === "items")?.source).toBeUndefined()
  })
})
