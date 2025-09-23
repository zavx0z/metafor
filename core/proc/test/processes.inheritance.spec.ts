import { test, expect } from "bun:test"
import { Processes, deserializeProcesses, ProcessesBase } from "../index.ts"
import { Context } from "@zavx0z/context"

test("наследование - базовый класс содержит общие методы", () => {
  const { schema } = new Context((t) => ({ name: t.string.required("anon") }))
  type S = typeof schema

  const processes = new Processes<S, "guest">((process) => ({
    guest: process()
      .action(({ context }) => context.name)
      .success(({ update, data }) => update({ name: data })),
  }))

  // Проверяем, что базовые методы доступны
  expect(processes.getProcess("guest"), "должен возвращать процесс").toBeDefined()
  expect(processes.hasProcess("guest"), "должен возвращать true для существующего процесса").toBe(true)
  expect(processes.hasProcess("nonexistent" as any), "должен возвращать false для несуществующего процесса").toBe(false)
  expect(processes.getProcessNames(), "должен возвращать массив имен процессов").toEqual(["guest"])
  expect(processes.size, "должен возвращать количество процессов").toBe(1)
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

  const processes = deserializeProcesses<S, "guest">(snapshot)

  // Проверяем, что функции десериализации работают
  expect(processes.getProcessNames(), "должен возвращать массив с guest").toEqual(["guest"])
  expect(processes.hasProcess("guest"), "должен возвращать true").toBe(true)
  expect(processes.hasProcess("nonexistent" as any), "должен возвращать false").toBe(false)
})

test("наследование - Processes и deserializeProcesses имеют одинаковый интерфейс", () => {
  const { schema } = new Context((t) => ({ name: t.string.required("anon") }))
  type S = typeof schema

  const processes = new Processes<S, "guest">((process) => ({
    guest: process().action(({ context }) => context.name),
  }))

  const deserialized = deserializeProcesses<S, "guest">({})

  // Проверяем, что оба имеют одинаковые методы
  expect(typeof processes.getProcess, "должен иметь метод getProcess").toBe("function")
  expect(typeof processes.hasProcess, "должен иметь метод hasProcess").toBe("function")
  expect(typeof processes.getAllProcesses, "должен иметь метод getAllProcesses").toBe("function")
  expect(typeof processes.getProcessNames, "должен иметь метод getProcessNames").toBe("function")
  expect(typeof processes.toSnapshot, "должен иметь метод toSnapshot").toBe("function")

  expect(typeof deserialized.getProcess, "deserializeProcesses должен иметь метод getProcess").toBe("function")
  expect(typeof deserialized.hasProcess, "deserializeProcesses должен иметь метод hasProcess").toBe("function")
  expect(typeof deserialized.getAllProcesses, "deserializeProcesses должен иметь метод getAllProcesses").toBe(
    "function"
  )
  expect(typeof deserialized.getProcessNames, "deserializeProcesses должен иметь метод getProcessNames").toBe(
    "function"
  )
})
