import { test, expect } from "bun:test"
import { processesFromSchema } from "../../src/processes.ts"
import { processesSchema, type ProcessesSchema } from "../../../meta/process.ts"
import { contextSchema } from "@zavx0z/context"

test("Строгая типизация действий", () => {
  const schema = contextSchema((t) => ({ name: t.string.required("anon") }))
  const processes = processesFromSchema(
    processesSchema<typeof schema, "guest", {}>((process) => ({
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
    })) as ProcessesSchema
  )

  const guestProcess = processes.get("guest")
  expect(typeof guestProcess?.success).toBe("function")
})
