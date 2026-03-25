import { describe, expect, test } from "bun:test"
import { Meta, Wimp } from "@dark/strong"
import {
  createFieldValueResolver,
  materializeFields,
  readFieldValues,
  resolveFieldValues,
  resolveNodeFieldInits,
  resolveNodeFieldValues,
} from "./fields.ts"

describe("вычислители полей strong", () => {
  const createMeta = (
    src: string,
    fieldSchemas: NonNullable<ConstructorParameters<typeof Meta>[0]["fieldSchemas"]>,
  ) =>
    new Meta({
      src,
      fieldSchemas,
    })

  test("сохраняют ложные значения `default` из AST", () => {
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

    expect(values, "вычислители полей должны сохранять сериализованные значения `default` как есть").toEqual({
      title: "",
      count: 0,
      active: false,
      items: [],
      mode: "a",
    })
  })

  test("ставят `null` для необязательного поля без `default`", () => {
    const value = createFieldValueResolver("error", {
      type: "string",
    })()

    expect(value, "необязательное поле без `default` должно начинаться с `null`").toBeNull()
  })

  test("падают на обязательном поле без `default`", () => {
    const resolve = createFieldValueResolver("command", {
      type: "string",
      required: true,
    })

    expect(resolve, "обязательное поле без `default` должно падать явно").toThrow(
      'Field "command" is required but has no default',
    )
  })

  test("строят значения для временного пакета из `node.fields` AST", () => {
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

    expect(values, "`node.fields` AST должен превращаться в плоский объект через вычислители полей").toEqual({
      operation: null,
      args: null,
    })
    expect(errorValues, "одиночный путь к полю должен превращаться в плоский объект через `expr`").toEqual({
      message: null,
    })
  })

  test("собирают объектные `Field` с владельцем, схемой, значением и `source`", () => {
    const parentMeta = createMeta("zavx0z/git", {
      args: {
        type: "string",
      },
    })
    const parent = new Wimp({ src: parentMeta.src, meta: parentMeta, parent: null })
    parent.fields = materializeFields(parent, parentMeta.fields)
    if (!parent.fields?.args) throw new Error("поле args не найдено")
    parent.fields.args.value = "--help"

    const childMeta = createMeta("zavx0z/git-start", {
      args: {
        type: "string",
      },
      operation: {
        type: "enum<string>",
        values: ["clone", "init"],
      },
    })
    const child = new Wimp({ src: childMeta.src, meta: childMeta, parent: parent })
    child.fields = materializeFields(
      child,
      childMeta.fields,
      [
        { key: "args", value: "--help", source: parent.fields.args! },
        { key: "operation", value: null, source: parent.fields.args! },
      ],
    )

    expect(child.fields!.args!.owner, "Field должен знать владельца").toBe(child)
    expect(child.fields!.args!.schema, "Field должен хранить схему").toEqual({ type: "string" })
    expect(child.fields!.args!.value, "Field должен хранить текущее значение").toBe("--help")
    expect(child.fields!.args!.source, "обычное поле должно ссылаться на поле родителя").toBe(parent.fields!.args)
    expect(
      child.fields!.operation!.source,
      "поле `enum` не должно смешиваться с прямой связью по источнику, даже если `init` принёс `source`",
    ).toBeNull()
  expect(readFieldValues(child.fields)).toEqual({ args: "--help", operation: null })
  })

  test("`resolveNodeFieldInits` сохраняет прямые ссылки на источник только для обычных полей", () => {
    const parentMeta = createMeta("zavx0z/git", {
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
    const parent = new Wimp({ src: parentMeta.src, meta: parentMeta, parent: null })
    parent.fields = materializeFields(parent, parentMeta.fields)

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
    expect(ordinaryInits?.find((fieldInit) => fieldInit.key === "args")?.source).toBe(parent.fields!.args)
    expect(arrayInits?.find((fieldInit) => fieldInit.key === "items")?.source).toBeUndefined()
  })
})
