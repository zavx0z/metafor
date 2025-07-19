/**
 * Пример использования Machine
 * @packageDocumentation
 */

import { Machine } from "./Machine.ts"
import type { StateConfig } from "./index.t.ts"

// Определяем типы
type UserStates = "idle" | "loading" | "success" | "error"
type UserContext = {
  name: { type: "string"; required: true }
  age: { type: "number"; required: false }
  isActive: { type: "boolean"; required: true }
  userId: { type: "string"; required: false }
}
type UserResult = {
  userId: string
  profile: { name: string; age: number | null }
}

// Конфигурация состояний
const userStateConfig: StateConfig<UserStates, UserContext, UserResult> = {
  idle: {
    to: {
      loading: {
        name: { length: { min: 2 } },
        isActive: true,
      },
    },
  },
  loading: {
    process: {
      action: async ({ context }) => {
        // Имитируем API запрос
        await new Promise((resolve) => setTimeout(resolve, 100))

        return {
          userId: `user_${Date.now()}`,
          profile: {
            name: context.name,
            age: context.age,
          },
        }
      },
      success: ({ update, data }) => {
        console.log(`Пользователь создан: ${data.userId}`)
        update({ userId: data.userId })
      },
      error: ({ update }) => {
        console.log("Ошибка при создании пользователя")
        update({ name: "error_user" })
      },
    },
    to: {
      success: {
        userId: { notEq: null as any },
      },
      error: {
        name: { eq: "error_user" },
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

// Создаем экземпляр автомата
const userMachine = new Machine<UserStates, UserContext, UserResult>(userStateConfig, "idle")

// Пример использования
async function example() {
  console.log("=== Пример использования Machine ===")

  // Начальное состояние
  console.log(`Текущее состояние: ${userMachine.currentState}`)
  console.log(`Выполняется: ${userMachine.isExecuting}`)
  console.log(`Доступные переходы: ${userMachine.availableTransitions.join(", ")}`)

  // Контекст пользователя
  const context = {
    name: "Иван",
    age: null,
    isActive: true,
    userId: null,
  }

  console.log("\n--- Проверяем переходы ---")
  console.log(`Можно перейти в loading: ${userMachine.canTransitionTo("loading", context)}`)
  console.log(`Можно перейти в success: ${userMachine.canTransitionTo("success", context)}`)

  // Выполняем переход
  console.log("\n--- Выполняем переход в loading ---")
  const transitionResult = userMachine.transitionTo("loading", context)
  console.log(`Переход выполнен: ${transitionResult}`)
  console.log(`Новое состояние: ${userMachine.currentState}`)
  console.log(`Доступные переходы: ${userMachine.availableTransitions.join(", ")}`)

  // Выполняем процесс
  console.log("\n--- Выполняем процесс ---")
  console.log(`Выполняется: ${userMachine.isExecuting}`)

  const result = await userMachine.execute(context)
  console.log(`Результат:`, result)
  console.log(`Выполняется: ${userMachine.isExecuting}`)

  // Проверяем переходы после выполнения
  console.log("\n--- Проверяем переходы после выполнения ---")
  const updatedContext = { ...context, userId: result?.userId || null }
  console.log(`Можно перейти в success: ${userMachine.canTransitionTo("success", updatedContext)}`)
  console.log(`Можно перейти в error: ${userMachine.canTransitionTo("error", updatedContext)}`)

  // Переходим в success
  console.log("\n--- Переходим в success ---")
  userMachine.transitionTo("success", updatedContext)
  console.log(`Текущее состояние: ${userMachine.currentState}`)

  // Возвращаемся в idle
  console.log("\n--- Возвращаемся в idle ---")
  userMachine.transitionTo("idle", updatedContext)
  console.log(`Текущее состояние: ${userMachine.currentState}`)
}

// Запускаем пример
if (import.meta.main) {
  example().catch(console.error)
}
