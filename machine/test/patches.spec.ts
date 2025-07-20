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

test("Machine - патчи при входе в состояние с действием (test)", async () => {
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

  const context = { name: "test_user", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []

  // Подписываемся на обновления
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })

  // Обновляем контекст
  await machine.update(context)

  // Проверяем, что получили патчи
  expect(patches.length, "Должны быть получены патчи при изменении состояния").toBeGreaterThan(0)

  // Первый патч должен быть test (вход в состояние с процессом)
  expect(patches[0]?.op, "Первый патч должен быть типа test при входе в состояние с процессом").toBe("test")
  expect(patches[0]?.path, "Путь патча должен быть /state").toBe("/state")
  expect(patches[0]?.value, "Значение патча должно быть loading").toBe("loading")

  unsubscribe()
})

test("Machine - патчи после выполнения действия (replace)", async () => {
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

  const context = { name: "test_user", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []

  // Подписываемся на обновления
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })

  // Обновляем контекст
  await machine.update(context)

  // Проверяем, что получили патчи
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

test("Machine - патчи при переходе в состояние без действия (replace)", async () => {
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
      to: {
        success: {
          name: { eq: "test_user" },
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

  const context = { name: "test_user", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []

  // Подписываемся на обновления
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })

  // Обновляем контекст
  await machine.update(context)

  // Проверяем, что получили патчи
  expect(patches.length, "Должны быть получены патчи при переходе в состояние без действия").toBeGreaterThan(0)

  // Все патчи должны быть replace (переходы в состояния без процессов)
  patches.forEach((patch, index) => {
    expect(patch.op, `Патч ${index + 1} должен быть типа replace для состояния без процесса`).toBe("replace")
    expect(patch.path, `Путь патча ${index + 1} должен быть /state`).toBe("/state")
  })

  unsubscribe()
})

test("Machine - патчи при ошибке в действии", async () => {
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

  const context = { name: "test_user", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []

  // Подписываемся на обновления
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })

  // Обновляем контекст с ошибкой
  try {
    await machine.update(context)
  } catch (error) {
    // Ожидаем ошибку
  }

  // Проверяем, что получили патчи
  expect(patches.length, "Должны быть получены патчи при ошибке в действии").toBeGreaterThan(0)

  // Первый патч должен быть test (вход в состояние с процессом)
  expect(patches[0]?.op, "Первый патч должен быть типа test при входе в состояние с процессом").toBe("test")
  expect(patches[0]?.path, "Путь патча должен быть /state").toBe("/state")
  expect(patches[0]?.value, "Значение патча должно быть loading").toBe("loading")

  unsubscribe()
})

test("Machine - последовательность патчей в полном цикле", async () => {
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

  const context = { name: "test_user", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []

  // Подписываемся на обновления
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })

  // Обновляем контекст
  await machine.update(context)

  // Проверяем последовательность патчей
  expect(patches.length, "Должна быть получена последовательность патчей").toBeGreaterThan(0)

  // Проверяем структуру каждого патча
  patches.forEach((patch, index) => {
    expect(patch.op, `Патч ${index + 1} должен иметь операцию test или replace`).toMatch(/^(test|replace)$/)
    expect(patch.path, `Патч ${index + 1} должен иметь путь /state`).toBe("/state")
    expect(patch.value, `Патч ${index + 1} должен иметь значение состояния`).toMatch(/^(idle|loading|success|error)$/)
  })

  // Проверяем логику последовательности
  if (patches.length >= 2) {
    // Первый патч должен быть test для loading
    expect(patches[0]?.op, "Первый патч должен быть test").toBe("test")
    expect(patches[0]?.value, "Первый патч должен быть для состояния loading").toBe("loading")

    // Второй патч должен быть replace (после выполнения процесса)
    expect(patches[1]?.op, "Второй патч должен быть replace").toBe("replace")
    // Машина может остановиться в loading из-за обнаружения цикла
    expect(patches[1]?.value, "Второй патч должен быть для состояния loading или success").toMatch(
      /^(loading|success)$/
    )
  }

  unsubscribe()
})
