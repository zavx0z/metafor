import { test, expect } from "bun:test"
import { MetaFor } from "../metafor.ts"
import type { StateConfig } from "../machine"

// Тестовые типы
type TestStates = "idle" | "loading" | "success"
type TestContext = {
  name: { type: "string"; required: true }
  isActive: { type: "boolean"; required: true }
}
type TestResult = {
  userId: string
  timestamp: number
}

test("MetaFor - интеграция с модулем machine", () => {
  const states: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {
          name: { length: { min: 3 } },
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
          update({ name: data.userId })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        success: {
          name: { startsWith: "user_" },
        },
      },
    },
    success: {
      to: {
        idle: {},
      },
    },
  }

  const metafor = MetaFor("test")
  const context = metafor.context((types) => ({
    name: types.string.required(),
    isActive: types.boolean.required(),
  }))
  expect(typeof context.states, "Метод states должен быть доступен").toBe("function")
  context.states(states)
  expect(customElements.get("metafor-test"), "Компонент должен быть зарегистрирован в customElements").toBeDefined()
})
