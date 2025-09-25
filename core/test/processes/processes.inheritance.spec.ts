import { test, expect } from "bun:test"
import { processesFromSchema } from "../../processes.ts"
import { Context } from "@zavx0z/context"

test("десериализация процессов работает корректно", () => {
  const { schema } = new Context((t) => ({ name: t.string.required("anon") }))
  type S = typeof schema

  const snapshot = {
    guest: {
      title: "guest",
      action: { read: ["name"], src: "({ context }) => context.name" },
      success: { write: ["name"], src: "({ update, data }) => update({ name: data })" },
    },
  }

  const processes = processesFromSchema<S, "guest">(snapshot)

  // Проверяем, что функции десериализации работают
  expect(processes.getProcess("guest"), "должен возвращать процесс").toBeDefined()
  expect(processes.hasProcess("guest"), "должен возвращать true для существующего процесса").toBe(true)
  expect(processes.hasProcess("nonexistent" as any), "должен возвращать false для несуществующего процесса").toBe(false)
  expect(processes.getProcessNames(), "должен возвращать массив имен процессов").toEqual(["guest"])
  expect(processes.getAllProcesses(), "должен возвращать объект с процессами").toHaveProperty("guest")
})

test("наследование - deserializeProcesses создается из snapshot", () => {
  const { schema } = new Context((t) => ({ name: t.string.required("anon") }))
  type S = typeof schema

  const snapshot = {
    guest: {
      title: "guest",
      action: { read: ["name"], src: "({ context }) => context.name" },
      success: { write: ["name"], src: "({ update, data }) => update({ name: data })" },
    },
  }

  const processes = processesFromSchema<S, "guest">(snapshot)

  // Проверяем, что функции десериализации работают
  expect(processes.getProcessNames(), "должен возвращать массив с guest").toEqual(["guest"])
  expect(processes.hasProcess("guest"), "должен возвращать true").toBe(true)
  expect(processes.hasProcess("nonexistent" as any), "должен возвращать false").toBe(false)
})

test("десериализация процессов имеет правильный интерфейс", () => {
  const { schema } = new Context((t) => ({ name: t.string.required("anon") }))
  type S = typeof schema

  const deserialized = processesFromSchema<S, "guest">({})

  // Проверяем, что функции десериализации имеют правильные методы
  expect(typeof deserialized.getProcess, "deserializeProcesses должен иметь метод getProcess").toBe("function")
  expect(typeof deserialized.hasProcess, "deserializeProcesses должен иметь метод hasProcess").toBe("function")
  expect(typeof deserialized.getAllProcesses, "deserializeProcesses должен иметь метод getAllProcesses").toBe(
    "function"
  )
  expect(typeof deserialized.getProcessNames, "deserializeProcesses должен иметь метод getProcessNames").toBe(
    "function"
  )
})
