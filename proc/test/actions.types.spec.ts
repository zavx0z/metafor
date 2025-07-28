import { test, expect } from "bun:test"
import { createActionsConfig } from "../index.ts"
import { types } from "../../context"
import type { ExtractValues } from "../../context"

test("Строгая типизация действий", () => {
  const schema = { name: types.string.required("anon") }
  type S = typeof schema
  const actions = createActionsConfig<S, "guest">((process) => ({
    guest: process()
      .action(({ context }) => context.name)
      .success(({ update, data }) => {
        // @ts-expect-error update требует Partial<V>
        update({ age: 42 })
        // @ts-expect-error data должен быть строкой
        update({ name: data.age })
      })
      .error(({ update, error }) => {
        // @ts-expect-error update требует Partial<V>
        update({ age: 42 })
      }),
  }))
  expect(typeof actions.guest?.success).toBe("function")
}) 