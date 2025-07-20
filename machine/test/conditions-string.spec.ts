import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"

// Тестовые типы состояний
type TestStates = "idle" | "string_test" | "success"

// Тестовые типы контекста с строковыми данными
type StringContext = {
  name: { type: "string"; required: true }
  email: { type: "string"; required: false }
  description: { type: "string"; required: true }
}

// Тестовый тип результата
type TestResult = {
  message: string
  timestamp: number
}

test("Machine - тесты строковых условий (required и optional)", async () => {
  const config: StateConfig<TestStates, StringContext, TestResult> = {
    idle: {
      to: {
        string_test: {
          name: { length: { min: 3 } },
          email: { null: false },
        },
      },
    },
    string_test: {
      process: {
        action: ({ context }) => ({
          message: `String test: ${context.name}`,
          timestamp: Date.now(),
        }),
        success: ({ update, data }) => {
          update({ description: data.message })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        success: {
          description: { startsWith: "String test" },
        },
      },
    },
    success: {
      to: {},
    },
  }

  // Тест 1: Корректные строковые данные
  const validContext = { name: "test_user", email: "test@example.com", description: "" }
  const machine = new Machine<TestStates, StringContext, TestResult>(config, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })

  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти в string_test при корректных строковых данных").toBe(
    "string_test"
  )

  // Тест 2: Короткое имя (не должно переходить)
  const shortNameContext = { name: "ab", email: "test@example.com", description: "" }
  const machine2 = new Machine<TestStates, StringContext, TestResult>(config, "idle", (values) => {
    Object.assign(shortNameContext, values)
    return shortNameContext
  })

  await machine2.update(shortNameContext)
  expect(machine2.currentState, "Машина не должна переходить при коротком имени").toBe("idle")

  // Тест 3: Null email (не должно переходить)
  const nullEmailContext = { name: "test_user", email: null, description: "" }
  const machine3 = new Machine<TestStates, StringContext, TestResult>(config, "idle", (values) => {
    Object.assign(nullEmailContext, values)
    return nullEmailContext
  })

  await machine3.update(nullEmailContext)
  expect(machine3.currentState, "Машина не должна переходить при null email").toBe("idle")
})

test("Machine - тесты сложных строковых условий", async () => {
  const config: StateConfig<TestStates, StringContext, TestResult> = {
    idle: {
      to: {
        string_test: {
          name: {
            startsWith: "test",
            endsWith: "user",
            include: "test",
            pattern: /^test.*user$/,
            length: { min: 8, max: 12 },
            notInclude: "admin",
            notStartsWith: "admin",
            notEndsWith: "admin",
          },
          email: {
            pattern: /^[^@]+@[^@]+\.[^@]+$/,
            null: false,
          },
        },
      },
    },
    string_test: {
      process: {
        action: ({ context }) => ({
          message: `Complex string test: ${context.name}`,
          timestamp: Date.now(),
        }),
        success: ({ update, data }) => {
          update({ description: data.message })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        success: {
          description: { startsWith: "Complex string test" },
        },
      },
    },
    success: {
      to: {},
    },
  }

  // Тест 1: Корректные сложные строковые данные
  const validContext = { name: "test_user", email: "test@example.com", description: "" }
  const machine = new Machine<TestStates, StringContext, TestResult>(config, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })

  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти в string_test при корректных сложных строковых данных").toBe(
    "string_test"
  )

  // Тест 2: Неправильный email (не должно переходить)
  const invalidEmailContext = { name: "test_user", email: "invalid-email", description: "" }
  const machine2 = new Machine<TestStates, StringContext, TestResult>(config, "idle", (values) => {
    Object.assign(invalidEmailContext, values)
    return invalidEmailContext
  })

  await machine2.update(invalidEmailContext)
  expect(machine2.currentState, "Машина не должна переходить при неправильном email").toBe("idle")

  // Тест 3: Имя с "admin" (не должно переходить)
  const adminNameContext = { name: "admin_user", email: "test@example.com", description: "" }
  const machine3 = new Machine<TestStates, StringContext, TestResult>(config, "idle", (values) => {
    Object.assign(adminNameContext, values)
    return adminNameContext
  })

  await machine3.update(adminNameContext)
  expect(machine3.currentState, "Машина не должна переходить при имени с 'admin'").toBe("idle")
})
