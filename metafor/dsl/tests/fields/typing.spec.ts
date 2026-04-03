import { describe, expect, test } from "bun:test"
import { MetaFor } from "../../index.ts"
import { fieldSchema } from "../../fields.ts"
import type { FieldType, Update, Values } from "../../fields.t.ts"

describe("field typing", () => {
  test("сохраняет инференс SchemaType, Values и Update", () => {
    const schema = fieldSchema((field) => ({
      name: field.string.required("guest", { id: true, label: "Имя" }),
      age: field.number.optional(),
      active: field.boolean.required(false),
      tags: field.array.required<string>([], { data: "user_tags" }),
      role: field.enum("user", "admin").required("user"),
      mode: field.enum("idle", "done").optional(),
    }))

    const nameField: FieldType<"string", true, string> = schema.name
    const values: Values<typeof schema> = {
      name: "meta",
      age: null,
      active: true,
      tags: ["a", "b"],
      role: "admin",
      mode: null,
    }
    const update: Update<typeof schema> = (next) => next

    expect(nameField.default).toBe("guest")
    expect(update({ age: 3, mode: "idle" })).toEqual({ age: 3, mode: "idle" })
    expect(values.tags).toEqual(["a", "b"])

    // @ts-expect-error required string cannot be null
    update({ name: null })
    // @ts-expect-error enum keeps literal union
    update({ role: "guest" })
    // @ts-expect-error array element type follows generic
    update({ tags: [1, 2, 3] })
    // @ts-expect-error optional enum still keeps literal union plus null
    const invalidValues: Values<typeof schema> = { ...values, mode: "draft" }
    void invalidValues
  })

  test("прокидывает refinement superposition в процессы", () => {
    MetaFor("typing-all-non-null")
      .fields((field) => ({
        command: field.string.optional(),
        operation: field.string.required(""),
        error: field.string.optional(),
      }))
      .superposition({
        start: {
          ready: { command: { null: false } },
        },
        retry: {
          ready: { command: { null: false } },
        },
        ready: null,
      })
      .mass({})
      .processes((process) => [
        process("ready", { env: ["any"] })
          .action(async ({ value }) => {
            const mod = await import("../../process.ts")
            void mod
            const command: string = value.command
            // @ts-expect-error command уже не nullable
            const nullOnly: null = value.command

            return {
              command,
              operation: value.operation,
            }
          })
          .success(({ update, data }) => {
            const command: string = data.command
            update({ command, operation: data.operation })
          })
          .error(({ update, error }) => {
            const message: string = error.message
            update({ error: message })
          }),
      ])
  })

  test("сохраняет nullable при частичном refinement", () => {
    MetaFor("typing-mixed-nullability")
      .fields((field) => ({
        command: field.string.optional(),
        operation: field.string.required(""),
      }))
      .superposition({
        start: {
          ready: { command: { null: false } },
        },
        idle: {
          ready: {},
        },
        ready: null,
      })
      .mass({})
      .processes((process) => [
        process("ready").action(async ({ value }) => {
          const mod = await import("../../process.ts")
          void mod
          const maybeCommand: string | null = value.command
          // @ts-expect-error не все входы гарантируют non-null
          const command: string = value.command

          return {
            operation: value.operation,
            command: maybeCommand,
          }
        }),
      ])
  })

  test("без refinement остается базовый Values", () => {
    MetaFor("typing-no-incoming-refinement")
      .fields((field) => ({
        command: field.string.optional(),
        operation: field.string.required(""),
      }))
      .superposition({
        ready: null,
      })
      .mass({})
      .processes((process) => [
        process("ready").action(async ({ value }) => {
          const mod = await import("../../process.ts")
          void mod
          const maybeCommand: string | null = value.command
          // @ts-expect-error без входящих guard-ов narrowing быть не должно
          const command: string = value.command

          return {
            operation: value.operation,
            command: maybeCommand,
          }
        }),
      ])
  })
})
