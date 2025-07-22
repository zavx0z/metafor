import { test, expect } from "bun:test"
import type { StateConfig } from "../index.t.ts"
import type { ExtractValues } from "../../context"

type TestStates = "idle" | "loading" | "success"
type TestContext = {
  name: { type: "string"; required: true }
  age: { type: "number"; required: false }
}
type Ctx = ExtractValues<TestContext>
type TestResult = {
  userId: string
  timestamp: number
}

test("StateConfig — типизация переходов и действий", () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: {
      loading: { name: { length: { min: 3 } } },
    },
    loading: {
      success: { age: { gt: 0 } },
    },
    success: {},
  }
  const actionsConfig = {
    loading: {
      action: ({ context }: { context: Ctx }) => {
        expect(typeof context.name, "context.name должен быть строкой").toBe("string")
        return { userId: context.name, timestamp: Date.now() }
      },
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: TestResult }) => {
        expect(typeof data.userId, "userId должен быть строкой").toBe("string")
        expect(typeof data.timestamp, "timestamp должен быть числом").toBe("number")
        update({ age: data.timestamp })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "error" })
      },
    },
  }
  // Проверяем, что типы корректны
  const result = actionsConfig.loading.action({ context: { name: "test", age: 25 } })
  expect(typeof result.userId, "userId должен быть строкой").toBe("string")
  expect(typeof result.timestamp, "timestamp должен быть числом").toBe("number")
})

test("StateConfig — только переходы без действий", () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: { loading: { name: { length: { min: 3 } } } },
    loading: { success: { age: { gt: 0 } } },
    success: {},
  }
  // Нет actionsConfig — проверяем, что можно создать только переходы
  expect(stateConfig.idle.loading).toBeDefined()
  expect(stateConfig.loading.success).toBeDefined()
})

test("StateConfig — частичная карта действий", () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: { loading: { name: { length: { min: 3 } } } },
    loading: { success: { age: { gt: 0 } } },
    success: {},
  }
  const actionsConfig = {
    loading: {
      action: ({ context }: { context: Ctx }) => ({ userId: context.name, timestamp: Date.now() }),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: TestResult }) => {
        update({ age: data.timestamp })
      },
    },
  }
  expect(typeof actionsConfig.loading.action, "Метод action должен быть функцией").toBe("function")
  expect(typeof actionsConfig.loading.success, "Метод success должен быть функцией").toBe("function")
  expect("idle" in actionsConfig, "Для idle не должно быть действий").toBe(false)
})
