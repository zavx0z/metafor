import { test, expect } from "bun:test"
import { MetaFor } from "../metafor.ts"
import type { StateConfig } from "../machine"
import { messagesFixture } from "../fixture/broadcast.ts"

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

test("MetaFor - интеграция с модулем machine", async () => {
  const {waitForMessages} = messagesFixture({meta: "test"})


  document.body.innerHTML = `<metafor-test></metafor-test>`

  const metafor = MetaFor("test").context((types) => ({
    name: types.string.required("name"),
    isActive: types.boolean.required(true),
  }))

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
        action: ({ context }) => {
          return {
            userId: `user_${context.name}`,
            timestamp: Date.now(),
          }
        },
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

  const element = document.querySelector("metafor-test")
  expect(element, "Компонент должен быть зарегистрирован в customElements").toBeDefined()

  expect(typeof metafor.states, "Метод states должен быть доступен").toBe("function")
  metafor.states(states)

  expect(customElements.get("metafor-test"), "Компонент должен быть зарегистрирован в customElements").toBeDefined()
  const messages = await waitForMessages(400)
  console.log(messages)
})
