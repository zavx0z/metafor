import { test, expect } from "bun:test"
import { processesFromSchema } from "../../src/processes.ts"
import { processesSchema, type ProcessesSchema } from "../../../dsl/meta/process.ts"
import { contextSchema } from "@zavx0z/context"

test("chain API — поддержка async action", async () => {
  const schema = contextSchema((field) => ({ name: field.string.required("anon") }))

  const processes = processesFromSchema(
    processesSchema<typeof schema, "guest", {}>((process) => ({
      guest: process()
        .action(async ({ context }) => {
          const mod = await import("./mock-action.ts")
          return mod.default(fields.name + "!async")
        })
        .success(({ update, data }) => {
          expect(data, "data должен быть строкой").toBeTypeOf("string")
          update({ name: data })
        }),
    })) as ProcessesSchema
  )

  const guestProcess = processes.get("guest")
  expect(typeof guestProcess?.success, "Метод success должен быть функцией").toBe("function")
})
