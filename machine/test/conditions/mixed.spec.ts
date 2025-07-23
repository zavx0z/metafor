import { test, expect } from "bun:test"
import { Machine } from "../../index.ts"
import type { StatesConfig } from "../../index.t.ts"
import type { ExtractValues } from "../../../context/index.ts"

// Тестовые типы состояний
type TestStates = "idle" | "mixed_test" | "success"

// Тестовые типы контекста со смешанными данными
type MixedContext = {
  name: { type: "string"; required: true }
  email: { type: "string"; required: false }
  age: { type: "number"; required: true }
  score: { type: "number"; required: false }
  isActive: { type: "boolean"; required: true }
  isVerified: { type: "boolean"; required: false }
  tags: { type: "array"; required: true }
  permissions: { type: "array"; required: false }
  status: { type: "enum"; required: true; values: readonly ["active", "inactive", "pending"] }
  role: { type: "enum"; required: false; values: readonly ["admin", "user", "moderator"] }
}
type Ctx = ExtractValues<MixedContext>

// Тестовый тип результата
type TestResult = {
  message: string
  timestamp: number
}

test("Machine - тесты смешанных условий (все типы в одном контексте)", async () => {
  const stateConfig: StatesConfig<TestStates, MixedContext> = {
    idle: {
      mixed_test: {
        name: { length: { min: 3 } },
        email: { null: false },
        age: { gte: 18 },
        score: { gt: 0 },
        isActive: true,
        isVerified: { eq: true },
        tags: { length: { min: 1 } },
        permissions: { null: false },
        status: { eq: "active" },
        role: { null: false },
      },
    },
    mixed_test: {
      success: {
        score: { gt: 0 },
        status: { eq: "active" },
      },
    },
    success: {},
  }

  const actionsConfig = {
    mixed_test: {
      action: ({ context }: { context: Ctx }) => ({
        message: `Mixed test: ${context.name} (${context.age}) - ${context.status}`,
        timestamp: Date.now(),
      }),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: TestResult }) => {
        update({ score: data.timestamp })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ isActive: false })
      },
    },
  }

  // Тест 1: Корректные смешанные данные
  const validContext: Ctx = {
    name: "test_user",
    email: "test@example.com",
    age: 25,
    score: 85,
    isActive: true,
    isVerified: true,
    tags: ["test", "user"],
    permissions: ["read", "write"],
    status: "active",
    role: "admin",
  }
  const machine = new Machine<TestStates, MixedContext>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })

  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти в success при корректных смешанных данных").toBe("success")

  // Тест 2: Недостаточный возраст (не должно переходить)
  const youngContext: Ctx = {
    name: "test_user",
    email: "test@example.com",
    age: 16,
    score: 85,
    isActive: true,
    isVerified: true,
    tags: ["test"],
    permissions: ["read"],
    status: "active",
    role: "user",
  }
  const machine2 = new Machine<TestStates, MixedContext>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(youngContext, values)
    return youngContext
  })

  await machine2.update(youngContext)
  expect(machine2.currentState, "Машина не должна переходить при недостаточном возрасте").toBe("idle")

  // Тест 3: Неактивный статус (не должно переходить)
  const inactiveContext: Ctx = {
    name: "test_user",
    email: "test@example.com",
    age: 25,
    score: 85,
    isActive: true,
    isVerified: true,
    tags: ["test"],
    permissions: ["read"],
    status: "inactive",
    role: "user",
  }
  const machine3 = new Machine<TestStates, MixedContext>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(inactiveContext, values)
    return inactiveContext
  })

  await machine3.update(inactiveContext)
  expect(machine3.currentState, "Машина не должна переходить при неактивном статусе").toBe("idle")
})
