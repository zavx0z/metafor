import { test, describe, expect } from "bun:test"
import { processesFromSchema, type Process } from "../../src/processes.ts"
import { contextSchema } from "@zavx0z/context"

describe("deserializeProcesses", () => {
  const schema = contextSchema((field) => ({
    value: field.number.required(0),
    name: field.string.required(""),
    isActive: field.boolean.required(false),
  }))
  type C = typeof schema
  type S = "idle" | "active" | "error"

  test("десериализация процессов из snapshot", () => {
    const snapshot = {
      increment: {
        label: "increment",
        desc: "Increment value",
        action: {
          read: ["value"],
          src: "({ context }) => fields.value + 1",
        },
      },
      reset: {
        label: "reset",
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

    const processes = processesFromSchema<C, S, {}>(snapshot)

    expect(processes.has("increment" as S), "процесс increment должен существовать").toBe(true)
    expect(processes.has("reset" as S), "процесс reset должен существовать").toBe(true)
    expect(processes.has("nonexistent" as S), "несуществующий процесс не должен существовать").toBe(false)

    const incrementProcess = processes.get("increment" as S)
    expect(incrementProcess, "процесс increment должен быть найден").toBeDefined()
    expect(incrementProcess?.label, "название процесса должно сохраниться").toBe("increment")
    expect(incrementProcess?.desc, "описание процесса должно сохраниться").toBe("Increment value")

    const resetProcess = processes.get("reset" as S)
    expect(resetProcess, "процесс reset должен быть найден").toBeDefined()
    expect(resetProcess?.label, "название процесса должно сохраниться").toBe("reset")
    expect(resetProcess?.success, "success обработчик должен быть восстановлен").toBeDefined()
    expect(resetProcess?.error, "error обработчик должен быть восстановлен").toBeDefined()
  })

  test("выполнение восстановленных функций", () => {
    const snapshot = {
      multiply: {
        action: {
          read: ["value"],
          src: "({ fields }) => fields.value * 2",
        },
        success: {
          read: [],
          write: ["value"],
          src: "({ update, data }) => update({ value: data })",
        },
      },
    }

    const processes = processesFromSchema<C, S, {}>(snapshot)
    const process = processes.get("multiply" as S)

    expect(process, "процесс должен быть найден").toBeDefined()

    // Тестируем action функцию
    const mockContext = { value: 5, name: "test", isActive: true }
    // @ts-ignore
    const result = process!.action({ fields: mockContext, mass: {} })
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

    const processes = processesFromSchema<C, S, {}>(snapshot)

    const allProcesses = processes.getAll()
    expect(Object.keys(allProcesses).length, "должно быть 3 процесса").toBe(3)
    // @ts-ignore
    expect(allProcesses.process1, "процесс 1 должен существовать").toBeDefined()
    // @ts-ignore
    expect(allProcesses.process2, "процесс 2 должен существовать").toBeDefined()
    // @ts-ignore
    expect(allProcesses.process3, "процесс 3 должен существовать").toBeDefined()

    const processNames = processes.names()
    expect(processNames, "имена процессов должны быть корректными").toEqual(["process1", "process2", "process3"])
  })

  test("пустой snapshot", () => {
    const processes = processesFromSchema<C, S, {}>({})

    expect(processes.has("any" as S), "не должно быть процессов").toBe(false)
    expect(processes.get("any" as S), "не должно быть процессов").toBeUndefined()
    expect(processes.getAll(), "объект процессов должен быть пустым").toEqual({} as Record<S, Process<C, {}>>)
    expect(processes.names(), "список имен должен быть пустым").toEqual([])
  })
})
