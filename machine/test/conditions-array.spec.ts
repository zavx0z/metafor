import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"

// Тестовые типы состояний
type TestStates = "idle" | "array_test" | "success"

// Тестовые типы контекста с массивными данными
type ArrayContext = {
  tags: { type: "array"; required: true }
  permissions: { type: "array"; required: false }
  scores: { type: "array"; required: true }
}

// Тестовый тип результата
type TestResult = {
  message: string
  timestamp: number
}

test("Machine - тесты массивных условий (required и optional)", async () => {
  const config: StateConfig<TestStates, ArrayContext, TestResult> = {
    idle: {
      to: {
        array_test: {
          tags: { length: { min: 1 } },
          permissions: { null: false },
          scores: { includes: 100 },
        },
      },
    },
    array_test: {
      process: {
        action: ({ context }) => ({
          message: `Array test: tags=${context.tags.length}, permissions=${context.permissions?.length}`,
          timestamp: Date.now(),
        }),
        success: ({ update, data }) => {
          update({ scores: [data.timestamp % 100] })
        },
        error: ({ update }) => {
          update({ tags: [] })
        },
      },
      to: {
        success: {
          scores: { every: (score: any) => score >= 0 },
        },
      },
    },
    success: {
      to: {},
    },
  }

  // Тест 1: Корректные массивные данные
  const validContext = { tags: ["test", "user"], permissions: ["read", "write"], scores: [100, 85, 90] }
  const machine = new Machine<TestStates, ArrayContext, TestResult>(config, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })

  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти в success при корректных массивных данных").toBe("success")

  // Тест 2: Пустые теги (не должно переходить)
  const emptyTagsContext = { tags: [], permissions: ["read"], scores: [100] }
  const machine2 = new Machine<TestStates, ArrayContext, TestResult>(config, "idle", (values) => {
    Object.assign(emptyTagsContext, values)
    return emptyTagsContext
  })

  await machine2.update(emptyTagsContext)
  expect(machine2.currentState, "Машина не должна переходить при пустых тегах").toBe("idle")

  // Тест 3: Null permissions (не должно переходить)
  const nullPermissionsContext = { tags: ["test"], permissions: null, scores: [100] }
  const machine3 = new Machine<TestStates, ArrayContext, TestResult>(config, "idle", (values) => {
    Object.assign(nullPermissionsContext, values)
    return nullPermissionsContext
  })

  await machine3.update(nullPermissionsContext)
  expect(machine3.currentState, "Машина не должна переходить при null permissions").toBe("idle")
})

test("Machine - тесты сложных массивных условий", async () => {
  const config: StateConfig<TestStates, ArrayContext, TestResult> = {
    idle: {
      to: {
        array_test: {
          tags: {
            length: { min: 1, max: 5 },
            includes: "test",
            notIncludes: "admin",
            every: (tag: any) => tag.length > 0,
            some: (tag: any) => tag.includes("test"),
            isEmpty: false,
          },
          permissions: {
            null: false,
            length: { min: 1 },
            includes: "read",
          },
          scores: {
            length: { min: 1 },
            every: (score: any) => score >= 0 && score <= 100,
            some: (score: any) => score === 100,
          },
        },
      },
    },
    array_test: {
      process: {
        action: ({ context }) => ({
          message: `Complex array test: ${context.tags.length} tags, ${context.permissions?.length} permissions`,
          timestamp: Date.now(),
        }),
        success: ({ update, data }) => {
          update({ scores: [data.timestamp % 100] })
        },
        error: ({ update }) => {
          update({ tags: [] })
        },
      },
      to: {
        success: {
          scores: { every: (score: any) => score >= 0 },
        },
      },
    },
    success: {
      to: {},
    },
  }

  // Тест 1: Корректные сложные массивные данные
  const validContext = {
    tags: ["test", "user", "demo"],
    permissions: ["read", "write", "execute"],
    scores: [100, 85, 90, 95],
  }
  const machine = new Machine<TestStates, ArrayContext, TestResult>(config, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })

  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти в success при корректных сложных массивных данных").toBe(
    "success"
  )

  // Тест 2: Теги с "admin" (не должно переходить)
  const adminTagsContext = {
    tags: ["test", "admin", "user"],
    permissions: ["read", "write"],
    scores: [100, 85],
  }
  const machine2 = new Machine<TestStates, ArrayContext, TestResult>(config, "idle", (values) => {
    Object.assign(adminTagsContext, values)
    return adminTagsContext
  })

  await machine2.update(adminTagsContext)
  expect(machine2.currentState, "Машина не должна переходить при тегах с 'admin'").toBe("idle")

  // Тест 3: Слишком много тегов (не должно переходить)
  const manyTagsContext = {
    tags: ["test", "user", "demo", "example", "sample", "temp"],
    permissions: ["read"],
    scores: [100],
  }
  const machine3 = new Machine<TestStates, ArrayContext, TestResult>(config, "idle", (values) => {
    Object.assign(manyTagsContext, values)
    return manyTagsContext
  })

  await machine3.update(manyTagsContext)
  expect(machine3.currentState, "Машина не должна переходить при слишком большом количестве тегов").toBe("idle")
})
