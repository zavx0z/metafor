import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"

// Тестовые типы
type TestStates = "idle" | "loading" | "success" | "error"
type TestContext = {
  name: { type: "string"; required: true }
  age: { type: "number"; required: false }
  isActive: { type: "boolean"; required: true }
}
type TestResult = {
  userId: string
  timestamp: number
}

test("Machine - базовая функциональность", () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {
          name: { startsWith: "test" },
          isActive: true,
        },
      },
    },
    loading: {
      process: {
        action: ({ context }) => ({
          userId: `user_${context.name}`,
          timestamp: Date.now(),
        }),
        success: ({ update, data }) => {
          update({ age: data.timestamp })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        success: {
          age: { gt: 0 },
        },
        error: {
          name: { eq: "error" },
        },
      },
    },
    success: {
      to: {
        idle: {},
      },
    },
    error: {
      to: {
        idle: {},
      },
    },
  }

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")

  // Проверяем начальное состояние
  expect(machine.currentState).toBe("idle")
  expect(machine.isExecuting).toBe(false)
  expect(machine.availableTransitions).toEqual(["loading"])

  // Проверяем переходы
  const context = { name: "test_user", age: null, isActive: true }

  expect(machine.canTransitionTo("loading", context)).toBe(true)
  expect(machine.canTransitionTo("success", context)).toBe(false)

  // Выполняем переход
  expect(machine.transitionTo("loading", context)).toBe(true)
  expect(machine.currentState).toBe("loading")
  expect(machine.availableTransitions).toEqual(["success", "error"])
})

test("Machine - выполнение процесса", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {},
      },
    },
    loading: {
      process: {
        action: ({ context }) => ({
          userId: `user_${context.name}`,
          timestamp: 12345,
        }),
        success: ({ update, data }) => {
          update({ age: data.timestamp })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        success: {},
      },
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "loading")
  const context = { name: "test", age: null, isActive: true }

  // Проверяем, что процесс не выполняется изначально
  expect(machine.isExecuting).toBe(false)

  // Выполняем процесс
  const result = await machine.execute(context)

  expect(result).toEqual({
    userId: "user_test",
    timestamp: 12345,
  })
  expect(machine.isExecuting).toBe(false)
})

test("Machine - проверка условий переходов", () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {
          name: { length: { min: 3 } },
          age: { gt: 18 },
          isActive: true,
        },
      },
    },
    loading: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")

  // Тест 1: Все условия выполняются
  const validContext = { name: "test_user", age: 25, isActive: true }
  expect(machine.canTransitionTo("loading", validContext)).toBe(true)

  // Тест 2: Слишком короткое имя
  const shortNameContext = { name: "ab", age: 25, isActive: true }
  expect(machine.canTransitionTo("loading", shortNameContext)).toBe(false)

  // Тест 3: Возраст слишком маленький
  const youngContext = { name: "test_user", age: 16, isActive: true }
  expect(machine.canTransitionTo("loading", youngContext)).toBe(false)

  // Тест 4: Неактивный пользователь
  const inactiveContext = { name: "test_user", age: 25, isActive: false }
  expect(machine.canTransitionTo("loading", inactiveContext)).toBe(false)
})

test("Machine - обработка ошибок", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {},
      },
    },
    loading: {
      process: {
        action: ({ context }) => {
          throw new Error("Test error")
        },
        error: ({ update }) => {
          update({ name: "error_user" })
        },
      },
      to: {
        error: {},
      },
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine(config, "loading")
  const context = { name: "test", age: null, isActive: true }

  // Выполняем процесс с ошибкой
  await expect(machine.execute(context)).rejects.toThrow("Test error")
  expect(machine.isExecuting).toBe(false)
})

test("Machine - предотвращение повторного выполнения", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {},
      },
    },
    loading: {
      process: {
        action: ({ context }) => {
          // Имитируем долгую операцию
          return new Promise<TestResult>((resolve) => {
            setTimeout(() => {
              resolve({
                userId: `user_${context.name}`,
                timestamp: Date.now(),
              })
            }, 100)
          })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        success: {},
      },
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine(config, "loading")
  const context = { name: "test", age: null, isActive: true }

  // Запускаем первый процесс
  const promise1 = machine.execute(context)
  expect(machine.isExecuting).toBe(true)

  // Пытаемся запустить второй процесс одновременно
  await expect(machine.execute(context)).rejects.toThrow("Процесс уже выполняется")

  // Ждем завершения первого процесса
  await promise1
  expect(machine.isExecuting).toBe(false)
})
