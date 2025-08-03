import { test, expect } from "bun:test"
import { Processes } from "../index.ts"
import { types } from "../../context"

test("Строгая типизация действий", () => {
  const schema = { name: types.string.required("anon") }
  type S = typeof schema
  const processes = new Processes<S, "guest">((process) => ({
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

  const guestProcess = processes.getProcess("guest")
  expect(typeof guestProcess?.success).toBe("function")
})
