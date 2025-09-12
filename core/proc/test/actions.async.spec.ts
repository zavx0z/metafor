import { test, expect } from "bun:test"
import { Processes } from "../index.ts"
import { Context } from "@zavx0z/context"

test("chain API — поддержка async action", async () => {
  const { schema } = new Context((t) => ({ name: t.string.required("anon") }))
  type S = typeof schema

  const processes = new Processes<S, "guest">((process) => ({
    guest: process()
      .action(async ({ context }) => {
        return context.name + "!async"
      })
      .success(({ update, data }) => {
        expect(data, "data должен быть строкой").toBeTypeOf("string")
        update({ name: data })
      }),
  }))

  const guestProcess = processes.getProcess("guest")
  expect(typeof guestProcess?.success, "Метод success должен быть функцией").toBe("function")
})
