import { test, expect } from "bun:test"
import { processesFromSchema } from "../../src/processes.ts"
import { processesSchema, type ProcessesSchema } from "../../../meta/process.ts"
import { contextSchema } from "@zavx0z/context"

test("Полный пример с destroy", () => {
  const schema = contextSchema((t) => ({
    children: t.number.optional(),
    current: t.number.optional(),
    process: t.array.optional() as any,
    error: t.string.optional(),
  }))
  const coreSchema = { child: [] }

  const processes = processesFromSchema(
    processesSchema<typeof schema, "данные" | "сборка" | "следующий" | "конец", typeof coreSchema>(
      (process, destroy) => ({
        данные: process()
          .action(({ core }) => core.child.length)
          .success(({ data, update }) => update({ children: data, current: 0 }))
          .error(({ error, update }) => update({ error: error.message })),
        сборка: process()
          .action(async ({ self, fields, core }) => {
            const id = `node_${Date.now()}`
            return [...((fields.process as string[]) || []), id]
          })
          .success(({ data, update }) => update({ process: data }))
          .error(({ error, update }) => update({ error: error.message })),
        следующий: process()
          .action(({ fields: { current, children } }) => {
            const last = (current || 0) + 1
            return last === children ? -1 : last
          })
          .success(({ data, update }) => update({ current: data }))
          .error(({ error, update }) => update({ error: error.message })),
        конец: destroy().before(({ core }) => {}),
      })
    )
  )

  // Проверяем, что все процессы созданы
  expect(processes.has("данные"), "процесс данные должен существовать").toBe(true)
  expect(processes.has("сборка"), "процесс сборка должен существовать").toBe(true)
  expect(processes.has("следующий"), "процесс следующий должен существовать").toBe(true)
  expect(processes.has("конец"), "процесс конец должен существовать").toBe(true)

  // Проверяем, что у обычных процессов есть success
  const dataProcess = processes.get("данные")
  expect(typeof dataProcess?.success, "процесс данные должен иметь success").toBe("function")

  const buildProcess = processes.get("сборка")
  expect(typeof buildProcess?.success, "процесс сборка должен иметь success").toBe("function")
})
