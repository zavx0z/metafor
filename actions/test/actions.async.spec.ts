import { test, expect } from "bun:test"
import { createActionsConfig } from "../index"
import { types } from "../../context"

test("chain API — поддержка async action", async () => {
  const schema = { name: types.string.required("anon") }
  type S = typeof schema

  const actions = createActionsConfig<S, "guest">((process) => ({
    guest: process()
      .action(async ({ context }) => {
        return context.name + "!async"
      })
      .success(({ update, data }) => {
        expect(data, "data должен быть строкой").toBeTypeOf("string")
        update({ name: data })
      }),
  }))
  expect(typeof actions.guest?.success, "Метод success должен быть функцией").toBe("function")
})
