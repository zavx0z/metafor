import { test, expect } from "bun:test"
import { processesFromSchema } from "../../src/processes.ts"
import { processesSchema, type ProcessesSchema } from "../../../meta/process.ts"
import { contextSchema } from "@zavx0z/context"

test("Базовый chain API для действий", () => {
  const schema = contextSchema((t) => ({
    name: t.string.required("anon"),
    age: t.number.required(18),
  }))

  const processes = processesFromSchema(
    processesSchema<typeof schema, "guest" | "user", {}>((process) => ({
      guest: process()
        .action(({ context }) => ({ name: fields.name, age: fields.age + 1 }))
        .success(({ update, data }) => {
          expect(data.name, "data.name должен быть строкой").toBeTypeOf("string")
          expect(data.age, "data.age должен быть числом").toBeTypeOf("number")
          update({ name: data.name, age: data.age })
        })
        .error(({ update, error }) => {
          expect(error, "error должен быть определён").toBeDefined()
          update({ name: "error" })
        }),
      user: process().action(({ context }) => ({ name: fields.name, age: fields.age })),
    })) as ProcessesSchema
  )

  const guestProcess = processes.get("guest")
  const userProcess = processes.get("user")

  expect(typeof guestProcess?.success, "Метод success должен быть функцией").toBe("function")
  expect(typeof guestProcess?.error, "Метод error должен быть функцией").toBe("function")
  expect(typeof userProcess?.action, "Метод action должен быть функцией").toBe("function")
})
