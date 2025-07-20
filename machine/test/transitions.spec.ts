import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"

// Тестовые типы
type TestStates = "idle" | "loading" | "processing" | "success" | "error"
type TestContext = {
  name: { type: "string"; required: true }
  age: { type: "number"; required: false }
  isActive: { type: "boolean"; required: true }
  step: { type: "number"; required: false }
  data: { type: "string"; required: false }
}
type TestResult = {
  userId: string
  timestamp: number
  step: number
  data: string
}

test("Machine - переходы во всех состояниях с действиями", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      process: {
        action: ({ context }) => ({
          userId: `user_${context.name}`,
          timestamp: Date.now(),
          step: 1,
          data: "initialized",
        }),
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ name: "error_user" })
        },
      },
      to: {
        loading: {
          step: { eq: 1 },
          isActive: true,
        },
      },
    },
    loading: {
      process: {
        action: ({ context }) => ({
          userId: context.name,
          timestamp: Date.now(),
          step: 2,
          data: "loading_data",
        }),
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -1 })
        },
      },
      to: {
        processing: {
          step: { eq: 2 },
          data: { include: "loading" },
        },
        error: {
          step: { eq: -1 },
        },
      },
    },
    processing: {
      process: {
        action: ({ context }) => ({
          userId: context.name,
          timestamp: Date.now(),
          step: 3,
          data: "processing_complete",
        }),
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -2 })
        },
      },
      to: {
        success: {
          step: { eq: 3 },
          data: { include: "complete" },
        },
        error: {
          step: { eq: -2 },
        },
      },
    },
    success: {
      process: {
        action: ({ context }) => ({
          userId: context.name,
          timestamp: Date.now(),
          step: 4,
          data: "final_success",
        }),
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -3 })
        },
      },
      to: {
        idle: {
          step: { eq: 4 },
        },
      },
    },
    error: {
      process: {
        action: ({ context }) => ({
          userId: context.name,
          timestamp: Date.now(),
          step: 0,
          data: "error_handled",
        }),
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -999 })
        },
      },
      to: {
        idle: {
          step: { eq: 0 },
        },
      },
    },
  }

  const context = { name: "test_user", age: null, isActive: true, step: null, data: null }
  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  // Начальное состояние
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")

  // Обрабатываем контекст - должны пройти через все состояния
  const result = await machine.update(context)

  // Проверяем, что получили результат
  expect(result, "Должен быть получен результат из процесса").toBeDefined()
  expect(result?.step, "Шаг должен быть 1 (первый выполненный процесс)").toBe(1)
  expect(result?.data, "Данные должны быть initialized").toBe("initialized")

  // Проверяем финальное состояние (машина остановится из-за обнаружения цикла)
  expect(machine.currentState, "Машина должна остановиться в состоянии loading").toBe("loading")
})

test("Machine - переходы с ошибками в каждом состоянии", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      process: {
        action: ({ context }) => {
          throw new Error("Idle error")
        },
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -1 })
        },
      },
      to: {
        error: {
          step: { eq: -1 },
        },
      },
    },
    loading: {
      process: {
        action: ({ context }) => {
          throw new Error("Loading error")
        },
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -2 })
        },
      },
      to: {
        error: {
          step: { eq: -2 },
        },
      },
    },
    processing: {
      process: {
        action: ({ context }) => {
          throw new Error("Processing error")
        },
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -3 })
        },
      },
      to: {
        error: {
          step: { eq: -3 },
        },
      },
    },
    success: {
      process: {
        action: ({ context }) => {
          throw new Error("Success error")
        },
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -4 })
        },
      },
      to: {
        error: {
          step: { eq: -4 },
        },
      },
    },
    error: {
      process: {
        action: ({ context }) => ({
          userId: context.name,
          timestamp: Date.now(),
          step: 0,
          data: "error_recovered",
        }),
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -999 })
        },
      },
      to: {
        idle: {
          step: { eq: 0 },
        },
      },
    },
  }

  const context = { name: "test_user", age: null, isActive: true, step: null, data: null }
  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  // Начальное состояние
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")

  // Обрабатываем контекст с ошибками
  expect(machine.update(context), "Должна быть выброшена ошибка из процесса").rejects.toThrow("Idle error")

  // Проверяем, что машина осталась в состоянии idle (ошибка не обрабатывается)
  expect(machine.currentState, "Машина должна остаться в состоянии idle").toBe("idle")
})

test("Machine - переходы с асинхронными действиями", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      process: {
        action: async ({ context }) => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return {
            userId: `user_${context.name}`,
            timestamp: Date.now(),
            step: 1,
            data: "async_initialized",
          }
        },
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -1 })
        },
      },
      to: {
        loading: {
          step: { eq: 1 },
        },
      },
    },
    loading: {
      process: {
        action: async ({ context }) => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return {
            userId: context.name,
            timestamp: Date.now(),
            step: 2,
            data: "async_loading",
          }
        },
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -2 })
        },
      },
      to: {
        processing: {
          step: { eq: 2 },
        },
      },
    },
    processing: {
      process: {
        action: async ({ context }) => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return {
            userId: context.name,
            timestamp: Date.now(),
            step: 3,
            data: "async_processing",
          }
        },
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -3 })
        },
      },
      to: {
        success: {
          step: { eq: 3 },
        },
      },
    },
    success: {
      process: {
        action: async ({ context }) => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return {
            userId: context.name,
            timestamp: Date.now(),
            step: 4,
            data: "async_success",
          }
        },
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -4 })
        },
      },
      to: {
        idle: {
          step: { eq: 4 },
        },
      },
    },
    error: {
      process: {
        action: async ({ context }) => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return {
            userId: context.name,
            timestamp: Date.now(),
            step: 0,
            data: "async_error_recovered",
          }
        },
        success: ({ update, data }) => {
          update({ step: data.step, data: data.data })
        },
        error: ({ update }) => {
          update({ step: -999 })
        },
      },
      to: {
        idle: {
          step: { eq: 0 },
        },
      },
    },
  }

  const context = { name: "test_user", age: null, isActive: true, step: null, data: null }
  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  // Начальное состояние
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")

  // Обрабатываем контекст с асинхронными действиями
  const result = await machine.update(context)

  // Проверяем, что получили результат
  expect(result, "Должен быть получен результат из асинхронного процесса").toBeDefined()
  expect(result?.step, "Шаг должен быть 1").toBe(1)
  expect(result?.data, "Данные должны содержать async").toContain("async")

  // Проверяем финальное состояние
  expect(machine.currentState, "Машина должна остановиться в состоянии loading").toBe("loading")
})
