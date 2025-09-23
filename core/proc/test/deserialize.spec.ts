import { test, describe, expect } from "bun:test"
import { deserializeProcesses } from "../index.ts"
import { Context } from "@zavx0z/context"

describe("deserializeProcesses", () => {
  const { schema } = new Context((t) => ({
    value: t.number.required(0),
    name: t.string.required(""),
    isActive: t.boolean.required(false),
  }))
  type C = typeof schema
  type S = "idle" | "active" | "error"

  test("десериализация процессов из snapshot", () => {
    const snapshot = {
      increment: {
        title: "increment",
        description: "Increment value",
        action: {
          read: ["value"],
          src: "({ context }) => context.value + 1",
        },
      },
      reset: {
        title: "reset",
        action: {
          read: ["value"],
          src: "({ context }) => 0",
        },
        success: {
          read: [],
          write: ["value"],
          src: "({ update, data }) => update({ value: data })",
        },
        error: {
          read: [],
          write: ["value"],
          src: "({ update, error }) => update({ value: 0 })",
        },
      },
    }

    const processes = deserializeProcesses<C, S, {}>(snapshot)

    expect(processes.hasProcess("increment"), "процесс increment должен существовать").toBe(true)
    expect(processes.hasProcess("reset"), "процесс reset должен существовать").toBe(true)
    expect(processes.hasProcess("nonexistent"), "несуществующий процесс не должен существовать").toBe(false)

    const incrementProcess = processes.getProcess("increment")
    expect(incrementProcess, "процесс increment должен быть найден").toBeDefined()
    expect(incrementProcess?.title, "название процесса должно сохраниться").toBe("increment")
    expect(incrementProcess?.description, "описание процесса должно сохраниться").toBe("Increment value")

    const resetProcess = processes.getProcess("reset")
    expect(resetProcess, "процесс reset должен быть найден").toBeDefined()
    expect(resetProcess?.title, "название процесса должно сохраниться").toBe("reset")
    expect(resetProcess?.success, "success обработчик должен быть восстановлен").toBeDefined()
    expect(resetProcess?.error, "error обработчик должен быть восстановлен").toBeDefined()
  })

  test("выполнение восстановленных функций", () => {
    const snapshot = {
      multiply: {
        action: {
          read: ["value"],
          src: "({ context }) => context.value * 2",
        },
        success: {
          read: [],
          write: ["value"],
          src: "({ update, data }) => update({ value: data })",
        },
      },
    }

    const processes = deserializeProcesses<C, S, {}>(snapshot)
    const process = processes.getProcess("multiply")

    expect(process, "процесс должен быть найден").toBeDefined()

    // Тестируем action функцию
    const mockContext = { value: 5, name: "test", isActive: true }
    const result = process!.action({ context: mockContext, core: {}, element: {} as any })
    expect(result, "action функция должна работать").toBe(10)

    // Тестируем success функцию
    let updatedContext: any = {}
    const mockUpdate = (updates: any) => {
      updatedContext = { ...updatedContext, ...updates }
      return updates
    }

    process!.success!({ update: mockUpdate, data: 20 })
    expect(updatedContext.value, "success функция должна обновить контекст").toBe(20)
  })

  test("получение всех процессов", () => {
    const snapshot = {
      process1: { action: { src: "() => 1" } },
      process2: { action: { src: "() => 2" } },
      process3: { action: { src: "() => 3" } },
    }

    const processes = deserializeProcesses<C, S, {}>(snapshot)

    const allProcesses = processes.getAllProcesses()
    expect(Object.keys(allProcesses).length, "должно быть 3 процесса").toBe(3)
    expect(allProcesses.process1, "процесс 1 должен существовать").toBeDefined()
    expect(allProcesses.process2, "процесс 2 должен существовать").toBeDefined()
    expect(allProcesses.process3, "процесс 3 должен существовать").toBeDefined()

    const processNames = processes.getProcessNames()
    expect(processNames, "имена процессов должны быть корректными").toEqual(["process1", "process2", "process3"])
  })

  test("пустой snapshot", () => {
    const processes = deserializeProcesses<C, S, {}>({})

    expect(processes.hasProcess("any"), "не должно быть процессов").toBe(false)
    expect(processes.getProcess("any"), "не должно быть процессов").toBeUndefined()
    expect(processes.getAllProcesses(), "объект процессов должен быть пустым").toEqual({})
    expect(processes.getProcessNames(), "список имен должен быть пустым").toEqual([])
  })
})
