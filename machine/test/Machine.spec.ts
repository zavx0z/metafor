import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"

// Тестовые типы
type TestStates = "idle" | "loading" | "success" | "error"
type TestContext = {
  name: { type: "string"; required: true }
  age: { type: "number"; required: false }
  isActive: { type: "boolean"; required: true }
}
type TestResult = {
  userId: string
  timestamp: number
}

test("Machine - автоматические переходы с update", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
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
          timestamp: 12345,
        }),
        success: ({ update, data }) => {
          update({ age: data.timestamp })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        success: {
          age: { gt: 0 },
        },
        error: {
          name: { eq: "error" },
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

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")
  const context = { name: "test_user", age: null, isActive: true }

  // Начальное состояние
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")

  // Обрабатываем контекст - должны автоматически перейти через idle -> loading -> success -> idle
  const result = await machine.update(context)

  // Проверяем результат
  expect(result, "Результат должен содержать userId и timestamp из процесса loading").toEqual({
    userId: "user_test_user",
    timestamp: 12345,
  })

  // Финальное состояние должно быть loading (машина остановилась при обнаружении цикла)
  expect(machine.currentState, "Машина должна остановиться в состоянии loading при обнаружении цикла").toBe("loading")
})

test("Machine - автоматические переходы с ошибкой", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
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
          throw new Error("Test error")
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        error: {
          name: { eq: "error" },
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

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")
  const context = { name: "test_user", age: null, isActive: true }

  // Начальное состояние
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")

  // Обрабатываем контекст с ошибкой - должны перейти idle -> loading -> error -> idle
  expect(machine.update(context), "Должна быть выброшена ошибка из процесса").rejects.toThrow("Test error")

  // Финальное состояние должно быть loading (машина остановилась при обнаружении цикла)
  expect(machine.currentState, "Машина должна остановиться в состоянии loading при обнаружении цикла").toBe("loading")
})

test("Machine - обработка контекста без переходов", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {
          name: { length: { min: 3 } },
          isActive: true,
        },
      },
    },
    loading: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")
  
  // Контекст, который не удовлетворяет условиям перехода
  const context = { name: "ab", age: null, isActive: true }

  // Начальное состояние
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")

  // Обрабатываем контекст - переходов не должно быть
  const result = await machine.update(context)

  // Результата не должно быть, так как нет процессов
  expect(result, "Результат должен быть undefined, так как не было выполнено ни одного процесса").toBeUndefined()
  
  // Состояние должно остаться idle
  expect(machine.currentState, "Состояние должно остаться idle, так как условия перехода не выполнены").toBe("idle")
})

test("Machine - обработка контекста с неактивным пользователем", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {
          name: { length: { min: 3 } },
          isActive: true,
        },
      },
    },
    loading: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")
  
  // Контекст с неактивным пользователем
  const context = { name: "test_user", age: null, isActive: false }

  // Начальное состояние
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")

  // Обрабатываем контекст - переходов не должно быть
  const result = await machine.update(context)

  // Результата не должно быть, так как нет процессов
  expect(result, "Результат должен быть undefined, так как пользователь неактивен").toBeUndefined()
  
  // Состояние должно остаться idle
  expect(machine.currentState, "Состояние должно остаться idle, так как пользователь неактивен").toBe("idle")
})

test("Machine - проверка состояния выполнения", () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {},
      },
    },
    loading: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")

  // Проверяем начальное состояние
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")
  expect(machine.isExecuting, "Машина не должна выполнять процесс в начальном состоянии").toBe(false)
})

test("Machine - подписка на обновления", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {
          name: { length: { min: 3 } },
          isActive: true,
        },
      },
    },
    loading: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []

  // Подписываемся на обновления
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach(patch => patches.push(patch))
  })

  // Обновляем контекст
  const context = { name: "test", age: null, isActive: true }
  await machine.update(context)

  // Проверяем, что получили уведомления
  expect(patches.length, "Должны быть получены патчи при изменении состояния").toBeGreaterThan(0)
  expect(patches[0]?.value, "Первый патч должен содержать состояние loading").toBe("loading")

  // Отписываемся
  unsubscribe()

  // Очищаем массив
  patches.length = 0

  // Обновляем снова - уведомлений не должно быть
  await machine.update(context)
  expect(patches.length, "После отписки не должно быть уведомлений").toBe(0)
})

test("Machine - проверка типов патчей", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
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
          timestamp: 12345,
        }),
        success: ({ update, data }) => {
          update({ age: data.timestamp })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        success: {
          age: { gt: 0 },
        },
      },
    },
    success: {
      to: {
        idle: {},
      },
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []

  // Подписываемся на обновления
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach(patch => patches.push(patch))
  })

  // Обновляем контекст
  const context = { name: "test_user", age: null, isActive: true }
  await machine.update(context)

  // Проверяем типы патчей
  expect(patches.length, "Должны быть получены патчи").toBeGreaterThan(0)
  
  // Первый патч должен быть test (вход в состояние с процессом)
  expect(patches[0]?.op, "Первый патч должен быть типа test при входе в состояние с процессом").toBe("test")
  expect(patches[0]?.path, "Путь патча должен быть /state").toBe("/state")
  expect(patches[0]?.value, "Значение патча должно быть loading").toBe("loading")

  // Второй патч должен быть replace (после выполнения процесса)
  if (patches.length > 1) {
    expect(patches[1]?.op, "Второй патч должен быть типа replace после выполнения процесса").toBe("replace")
    expect(patches[1]?.path, "Путь патча должен быть /state").toBe("/state")
  }

  unsubscribe()
})

test("Machine - проверка условий перехода", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {
          name: { length: { min: 3 } },
          isActive: true,
        },
      },
    },
    loading: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")

  // Тест 1: Короткое имя (не должно переходить)
  const shortNameContext = { name: "ab", age: null, isActive: true }
  await machine.update(shortNameContext)
  expect(machine.currentState, "Машина не должна переходить при коротком имени").toBe("idle")

  // Тест 2: Неактивный пользователь (не должно переходить)
  const inactiveContext = { name: "test_user", age: null, isActive: false }
  await machine.update(inactiveContext)
  expect(machine.currentState, "Машина не должна переходить при неактивном пользователе").toBe("idle")

  // Тест 3: Корректные данные (должно перейти)
  const validContext = { name: "test_user", age: null, isActive: true }
  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти при корректных данных").toBe("loading")
})

test("Machine - проверка максимального количества итераций", async () => {
  const config: StateConfig<TestStates, TestContext, TestResult> = {
    idle: {
      to: {
        loading: {},
      },
    },
    loading: {
      to: {
        idle: {},
      },
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle")
  const context = { name: "test", age: null, isActive: true }

  // Создаем бесконечный цикл idle <-> loading
  await machine.update(context)

  // Машина должна остановиться из-за максимального количества итераций
  expect(machine.currentState, "Машина должна остановиться в состоянии loading").toBe("loading")
})
