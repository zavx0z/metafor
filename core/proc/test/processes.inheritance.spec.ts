import { test, expect } from "bun:test"
import { Processes, ProcessesClone, ProcessesBase } from "../index.ts"
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

test("наследование - ProcessesClone создается из snapshot", () => {
  const { schema } = new Context((t) => ({ name: t.string.required("anon") }))
  type S = typeof schema

  const snapshot = {
    guest: {
      title: "guest",
      action: { read: ["name"] },
      success: { write: ["name"] },
    },
  }

  const clone = ProcessesClone.fromSnapshot<S, "guest">(snapshot)

  // Проверяем, что clone имеет базовые методы
  expect(clone.getProcessNames(), "должен возвращать пустой массив").toEqual([])
  expect(clone.size, "должен возвращать 0").toBe(0)
  expect(clone.hasProcess("guest"), "должен возвращать false").toBe(false)
})

test("наследование - Processes и ProcessesClone имеют одинаковый интерфейс", () => {
  const { schema } = new Context((t) => ({ name: t.string.required("anon") }))
  type S = typeof schema

  const processes = new Processes<S, "guest">((process) => ({
    guest: process().action(({ context }) => context.name),
  }))

  const clone = new ProcessesClone<S, "guest">()

  // Проверяем, что оба класса имеют одинаковые методы
  expect(typeof processes.getProcess, "должен иметь метод getProcess").toBe("function")
  expect(typeof processes.hasProcess, "должен иметь метод hasProcess").toBe("function")
  expect(typeof processes.getAllProcesses, "должен иметь метод getAllProcesses").toBe("function")
  expect(typeof processes.getProcessNames, "должен иметь метод getProcessNames").toBe("function")
  expect(typeof processes.toSnapshot, "должен иметь метод toSnapshot").toBe("function")

  expect(typeof clone.getProcess, "clone должен иметь метод getProcess").toBe("function")
  expect(typeof clone.hasProcess, "clone должен иметь метод hasProcess").toBe("function")
  expect(typeof clone.getAllProcesses, "clone должен иметь метод getAllProcesses").toBe("function")
  expect(typeof clone.getProcessNames, "clone должен иметь метод getProcessNames").toBe("function")
})
