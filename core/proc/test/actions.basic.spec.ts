import { test, expect } from "bun:test"
import { Processes } from "../index.ts"
import { types } from "../../context"

test("Базовый chain API для действий", () => {
  const ctxSchema = {
    name: types.string.required("anon"),
    age: types.number.required(18),
  }
  type CtxSchema = typeof ctxSchema

  const processes = new Processes<CtxSchema, "guest" | "user">((process) => ({
    guest: process()
      .action(({ context }) => ({ name: context.name, age: context.age + 1 }))
      .success(({ update, data }) => {
        expect(data.name, "data.name должен быть строкой").toBeTypeOf("string")
        expect(data.age, "data.age должен быть числом").toBeTypeOf("number")
        update({ name: data.name, age: data.age })
      })
      .error(({ update, error }) => {
        expect(error, "error должен быть определён").toBeDefined()
        update({ name: "error" })
      }),
    user: process().action(({ context }) => ({ name: context.name, age: context.age })),
  }))

  const guestProcess = processes.getProcess("guest")
  const userProcess = processes.getProcess("user")

  expect(typeof guestProcess?.success, "Метод success должен быть функцией").toBe("function")
  expect(typeof guestProcess?.error, "Метод error должен быть функцией").toBe("function")
  expect(typeof userProcess?.action, "Метод action должен быть функцией").toBe("function")
})
