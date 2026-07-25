import { describe, expect, test } from "bun:test"
import { MetaFor } from "../../index.ts"
import { fieldSchema } from "../../fields.ts"
import type { FieldType, Update, Values } from "@metafor/types/metafor/fields"

describe("field typing", () => {
  test("сохраняет инференс SchemaType, Values и Update", () => {
    const schema = fieldSchema((field) => ({
      name: field.string.required("guest", { id: true, label: "Имя" }),
      age: field.number.optional(),
      active: field.boolean.required(false),
      tags: field.array.required([], { data: "user_tags" }),
      role: field.enum("user", "admin").required("user"),
      mode: field.enum("idle", "done").optional(),
    }))

    const nameField: FieldType<"string", true, string> = schema.name
    const values: Values<typeof schema> = {
      name: "meta",
      age: null,
      active: true,
      tags: [1, 2],
      role: "admin",
      mode: null,
    }
    const update: Update<typeof schema> = (next) => next

    expect(nameField.default).toBe("guest")
    expect(update({ age: 3, mode: "idle" })).toEqual({ age: 3, mode: "idle" })
    expect(values.tags).toEqual([1, 2])

    // @ts-expect-error required string cannot be null
    update({ name: null })
    // @ts-expect-error enum keeps literal union
    update({ role: "guest" })
    // @ts-expect-error topology array is fixed to number[]
    update({ tags: ["a", "b"] })
    // Восстановлено из исторического context/test/update.spec.ts.
    // @ts-expect-error exactOptionalPropertyTypes запрещает undefined
    update({ name: undefined })
    // @ts-expect-error optional enum still keeps literal union plus null
    const invalidValues: Values<typeof schema> = { ...values, mode: "draft" }
    void invalidValues

    // Восстановлено из исторического context/test/context.spec.ts.
    // @ts-expect-error enum принимает только непустой список строк
    fieldSchema((field) => ({ invalid: field.enum(true, false).optional() }))
    // @ts-expect-error enum принимает только непустой список строк
    fieldSchema((field) => ({ invalid: field.enum({}).optional() }))
  })

  test("проверяет точные Fields, состояния и enum-условия Superposition", () => {
    const valid = MetaFor("typing-exact-superposition")
      .fields((field) => ({
        role: field.enum("user", "admin").required("user"),
        command: field.string.optional(),
      }))
      .superposition({
        idle: {
          ready: {
            role: { oneOf: ["user", "admin"] },
            command: { null: false },
          },
        },
        ready: null,
      })
      .mass(() => ({}))
      .energy()
      .processes(() => [])
      .reactions(() => [])
      .matter()
      .bulk()
    expect(valid.superposition).toHaveLength(2)

    const invalidEnum = MetaFor("typing-invalid-enum")
      .fields((field) => ({ role: field.enum("user", "admin").required("user") }))
    // @ts-expect-error enum-condition сохраняет литеральный union вариантов
    invalidEnum.superposition({ idle: { ready: { role: { eq: "guest" } } }, ready: null })

    const invalidOperator = MetaFor("typing-invalid-operator")
      .fields((field) => ({ command: field.string.optional() }))
    // @ts-expect-error неизвестный оператор условия запрещён
    invalidOperator.superposition({ idle: { ready: { command: { unknown: true } } }, ready: null })

    const invalidField = MetaFor("typing-invalid-field")
      .fields((field) => ({ command: field.string.optional() }))
    // @ts-expect-error transition ссылается только на объявленные Fields
    invalidField.superposition({ idle: { ready: { missing: { null: false } } }, ready: null })

    const invalidState = MetaFor("typing-invalid-state")
      .fields((field) => ({ command: field.string.optional() }))
    // @ts-expect-error transition ссылается только на состояния этой Superposition
    invalidState.superposition({ idle: { missing: { command: { null: false } } }, ready: null })

    const invalidSelfTransition = MetaFor("typing-invalid-self-transition")
      .fields((field) => ({ command: field.string.optional() }))
    if (false) {
      // @ts-expect-error самопереход запрещён даже при условии на Field
      invalidSelfTransition.superposition({ idle: { idle: { command: { null: false } } } })
    }
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
      .mass(() => ({}))
      .energy()
      .processes((process) => [
        process("ready", { env: ["any"] })
          .action(async ({ value }) => {
            const probe = await import("../types/fixtures/probe.ts")
            return probe.default({
              command: value.command satisfies string,
              // @ts-expect-error command уже не nullable
              nullOnly: value.command satisfies null,
              operation: value.operation,
            })
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
      .mass(() => ({}))
      .energy()
      .processes((process) => [
        process("ready").action(async ({ value }) => {
          const probe = await import("../types/fixtures/probe.ts")
          return probe.default({
            operation: value.operation,
            maybeCommand: value.command satisfies string | null,
            // @ts-expect-error не все входы гарантируют non-null
            command: value.command satisfies string,
          })
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
      .mass(() => ({}))
      .energy()
      .processes((process) => [
        process("ready").action(async ({ value }) => {
          const probe = await import("../types/fixtures/probe.ts")
          return probe.default({
            operation: value.operation,
            maybeCommand: value.command satisfies string | null,
            // @ts-expect-error без входящих guard-ов narrowing быть не должно
            command: value.command satisfies string,
          })
        }),
      ])
  })
})
