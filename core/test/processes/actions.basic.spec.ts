import { test, expect } from "bun:test"
import { Processes } from "../../processes.ts"
import { Context } from "@zavx0z/context"

test("Базовый chain API для действий", () => {
  const { schema } = new Context((t) => ({
    name: t.string.required("anon"),
    age: t.number.required(18),
  }))

  const processes = new Processes<typeof schema, "guest" | "user">((process) => ({
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
