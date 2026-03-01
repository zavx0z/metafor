import { test, expect } from "bun:test"
import { processesFromSchema } from "../../src/processes.ts"
import { contextSchema } from "@zavx0z/context"

test("десериализация процессов работает корректно", () => {
  const schema = contextSchema((field) => ({ name: field.string.required("anon") }))
  type S = typeof schema

  const snapshot = {
    guest: {
      label: "guest",
      action: { read: ["name"], src: "({ context }) => fields.name" },
      success: { write: ["name"], src: "({ update, data }) => update({ name: data })" },
    },
  }

  const processes = processesFromSchema<S, "guest">(snapshot)

  // Проверяем, что функции десериализации работают
  expect(processes.get("guest"), "должен возвращать процесс").toBeDefined()
  expect(processes.has("guest"), "должен возвращать true для существующего процесса").toBe(true)
  expect(processes.has("nonexistent" as any), "должен возвращать false для несуществующего процесса").toBe(false)
  expect(processes.names(), "должен возвращать массив имен процессов").toEqual(["guest"])
  expect(processes.getAll(), "должен возвращать объект с процессами").toHaveProperty("guest")
})

test("наследование - deserializeProcesses создается из snapshot", () => {
  const schema = contextSchema((field) => ({ name: field.string.required("anon") }))
  type S = typeof schema

  const snapshot = {
    guest: {
      label: "guest",
      action: { read: ["name"], src: "({ context }) => fields.name" },
      success: { write: ["name"], src: "({ update, data }) => update({ name: data })" },
    },
  }

  const processes = processesFromSchema<S, "guest">(snapshot)

  // Проверяем, что функции десериализации работают
  expect(processes.names(), "должен возвращать массив с guest").toEqual(["guest"])
  expect(processes.has("guest"), "должен возвращать true").toBe(true)
  expect(processes.has("nonexistent" as any), "должен возвращать false").toBe(false)
})

test("десериализация процессов имеет правильный интерфейс", () => {
  const schema = contextSchema((field) => ({ name: field.string.required("anon") }))
  type S = typeof schema

  const deserialized = processesFromSchema<S, "guest">({})

  // Проверяем, что функции десериализации имеют правильные методы
  expect(typeof deserialized.get, "deserializeProcesses должен иметь метод getProcess").toBe("function")
  expect(typeof deserialized.has, "deserializeProcesses должен иметь метод hasProcess").toBe("function")
  expect(typeof deserialized.getAll, "deserializeProcesses должен иметь метод getAllProcesses").toBe("function")
  expect(typeof deserialized.names, "deserializeProcesses должен иметь метод getProcessNames").toBe("function")
})
