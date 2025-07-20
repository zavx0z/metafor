import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"

// Тестовые типы состояний
type TestStates = "idle" | "mixed_test" | "success"

// Тестовые типы контекста со смешанными данными
type MixedContext = {
  // String fields
  name: { type: "string"; required: true }
  email: { type: "string"; required: false }

  // Number fields
  age: { type: "number"; required: true }
  score: { type: "number"; required: false }

  // Boolean fields
  isActive: { type: "boolean"; required: true }
  isVerified: { type: "boolean"; required: false }

  // Array fields
  tags: { type: "array"; required: true }
  permissions: { type: "array"; required: false }

  // Enum fields
  status: { type: "enum"; required: true; values: readonly ["active", "inactive", "pending"] }
  role: { type: "enum"; required: false; values: readonly ["admin", "user", "moderator"] }
}

// Тестовый тип результата
type TestResult = {
  message: string
  timestamp: number
}

test("Machine - тесты смешанных условий (все типы в одном контексте)", async () => {
  const config: StateConfig<TestStates, MixedContext, TestResult> = {
    idle: {
      to: {
        mixed_test: {
          // String conditions
          name: { length: { min: 3 } },
          email: { null: false },

          // Number conditions
          age: { gte: 18 },
          score: { gt: 0 },

          // Boolean conditions
          isActive: true,
          isVerified: { eq: true },

          // Array conditions
          tags: { length: { min: 1 } },
          permissions: { null: false },

          // Enum conditions
          status: { eq: "active" },
          role: { null: false },
        },
      },
    },
    mixed_test: {
      process: {
        action: ({ context }) => ({
          message: `Mixed test: ${context.name} (${context.age}) - ${context.status}`,
          timestamp: Date.now(),
        }),
        success: ({ update, data }) => {
          update({ score: data.timestamp })
        },
        error: ({ update }) => {
          update({ isActive: false })
        },
      },
      to: {
        success: {
          score: { gt: 0 },
        },
      },
    },
    success: {
      to: {},
    },
  }

  // Тест 1: Корректные смешанные данные
  const validContext = {
    name: "test_user",
    email: "test@example.com",
    age: 25,
    score: 85,
    isActive: true,
    isVerified: true,
    tags: ["test", "user"],
    permissions: ["read", "write"],
    status: "active" as const,
    role: "admin" as const,
  }
  const machine = new Machine<TestStates, MixedContext, TestResult>(config, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })

  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти в success при корректных смешанных данных").toBe("success")

  // Тест 2: Недостаточный возраст (не должно переходить)
  const youngContext = {
    name: "test_user",
    email: "test@example.com",
    age: 16,
    score: 85,
    isActive: true,
    isVerified: true,
    tags: ["test"],
    permissions: ["read"],
    status: "active" as const,
    role: "user" as const,
  }
  const machine2 = new Machine<TestStates, MixedContext, TestResult>(config, "idle", (values) => {
    Object.assign(youngContext, values)
    return youngContext
  })

  await machine2.update(youngContext)
  expect(machine2.currentState, "Машина не должна переходить при недостаточном возрасте").toBe("idle")

  // Тест 3: Неактивный статус (не должно переходить)
  const inactiveContext = {
    name: "test_user",
    email: "test@example.com",
    age: 25,
    score: 85,
    isActive: true,
    isVerified: true,
    tags: ["test"],
    permissions: ["read"],
    status: "inactive" as const,
    role: "user" as const,
  }
  const machine3 = new Machine<TestStates, MixedContext, TestResult>(config, "idle", (values) => {
    Object.assign(inactiveContext, values)
    return inactiveContext
  })

  await machine3.update(inactiveContext)
  expect(machine3.currentState, "Машина должна перейти в success при неактивном статусе").toBe("success")
})
