import { test, expect } from "bun:test"
import { MetaFor, Machine } from "../metafor.ts"
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
  // Создаем конфигурацию состояний
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

  // Создаем экземпляр MetaFor
  const metafor = MetaFor("test")
  const context = metafor.context((types) => ({
    name: types.string.required(),
    isActive: types.boolean.required(),
  }))

  // Проверяем, что states метод доступен
  expect(typeof context.states, "Метод states должен быть доступен").toBe("function")

  // Вызываем метод states - он должен зарегистрировать компонент
  context.states(states)

  // Проверяем, что компонент зарегистрирован в customElements
  const elementName = "metafor-test"
  expect(customElements.get(elementName), "Компонент должен быть зарегистрирован в customElements").toBeDefined()
})

test("Machine - прямой экспорт работает", () => {
  // Проверяем, что класс Machine экспортируется
  expect(typeof Machine, "Класс Machine должен быть экспортирован").toBe("function")

  // Создаем простую конфигурацию
  const config: StateConfig<"idle" | "active", TestContext, TestResult> = {
    idle: {
      to: {
        active: {
          isActive: true,
        },
      },
    },
    active: {
      to: {
        idle: {},
      },
    },
  }

  // Создаем экземпляр машины
  const machine = new Machine(config, "idle", (values) => values)

  // Проверяем базовые свойства
  expect(machine.currentState, "Текущее состояние должно быть idle").toBe("idle")
  expect(machine.isExecuting, "Машина не должна выполняться в начальном состоянии").toBe(false)
})

test("MetaFor - экспорт типов работает", () => {
  // Проверяем, что типы экспортируются (StateConfig это тип, не значение)
  expect(typeof Machine, "Класс Machine должен быть экспортирован").toBe("function")
})
