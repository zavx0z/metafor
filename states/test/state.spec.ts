import { test, expect } from "bun:test"
import type { StateProcess, StateDefinition, StateConfig } from "../index.ts"

// Тестовые типы контекста
type TestContext = {
  name: { type: "string"; required: true }
  age: { type: "number"; required: false }
}

// Тестовый тип результата
type TestResult = {
  userId: string
  timestamp: number
}

test("StateProcess типизация с generic параметром R", () => {
  const process: StateProcess<TestContext, TestResult> = {
    action: ({ context }) => {
      // TypeScript должен вывести тип context как { name: string, age: number | null }
      expect(context.name).toBeTypeOf("string")

      // Возвращаем результат с правильным типом
      return {
        userId: "123",
        timestamp: Date.now(),
      }
    },
    success: ({ update, data }) => {
      // TypeScript должен вывести тип data как TestResult
      expect(data.userId).toBeTypeOf("string")
      expect(data.timestamp).toBeTypeOf("number")

      // Обновляем контекст с результатом
      update({ age: data.timestamp })
    },
    error: ({ update }) => {
      update({ name: "error" })
    },
  }

  // Проверяем, что process.action возвращает правильный тип
  const result = process.action({ context: { name: "test", age: 25 } })
  expect(result.userId).toBeTypeOf("string")
  expect(result.timestamp).toBeTypeOf("number")
})

test("StateDefinition с generic параметром R", () => {
  const stateDefinition: StateDefinition<"test", TestContext, TestResult> = {
    process: {
      action: ({ context }) => ({
        userId: context.name,
        timestamp: Date.now(),
      }),
      success: ({ update, data }) => {
        update({ age: data.timestamp })
      },
      error: ({ update }) => {
        update({ name: "error" })
      },
    },
    to: {},
  }

  expect(stateDefinition.process).toBeDefined()
})

test("StateConfig с generic параметром R", () => {
  const stateConfig: StateConfig<"state1" | "state2", TestContext, TestResult> = {
    state1: {
      process: {
        action: ({ context }) => ({
          userId: context.name,
          timestamp: Date.now(),
        }),
        success: ({ update, data }) => {
          update({ age: data.timestamp })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {},
    },
    state2: {
      to: {},
    },
  }

  expect(stateConfig.state1.process).toBeDefined()
  expect(stateConfig.state2.process).toBeUndefined()
})
