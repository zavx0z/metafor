import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"
import type { ExtractValues } from "../../context"

type TestStates = "idle" | "loading" | "success" | "error"
type TestContext = {
  name: { type: "string"; required: true }
  age: { type: "number"; required: false }
  isActive: { type: "boolean"; required: true }
}
type Ctx = ExtractValues<TestContext>
type TestResult = {
  userId: string
  timestamp: number
}

test("Machine - патчи при входе в состояние с действием (test)", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: {
      loading: {
        name: { length: { min: 3 } },
        isActive: true,
      },
    },
    loading: {
      success: { age: { gt: 0 } },
    },
    success: { idle: {} },
    error: {},
  }
  const actionsConfig = {
    loading: {
      action: ({ context }: { context: Ctx }) => ({
        userId: `user_${context.name}`,
        timestamp: 12345,
      }),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: TestResult }) => {
        update({ age: data.timestamp })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "error" })
      },
    },
  }
  const context: Ctx = { name: "test_user", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })
  await machine.update(context)
  expect(patches.length, "Должны быть получены патчи при изменении состояния").toBeGreaterThan(0)
  expect(patches[0]?.op, "Первый патч должен быть типа test при входе в состояние с процессом").toBe("test")
  expect(patches[0]?.path, "Путь патча должен быть /state").toBe("/state")
  expect(patches[0]?.value, "Значение патча должно быть loading").toBe("loading")
  unsubscribe()
})

test("Machine - патчи после выполнения действия (replace)", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: {
      loading: {
        name: { length: { min: 3 } },
        isActive: true,
      },
    },
    loading: {
      success: { age: { gt: 0 } },
    },
    success: { idle: {} },
    error: {},
  }
  const actionsConfig = {
    loading: {
      action: ({ context }: { context: Ctx }) => ({
        userId: `user_${context.name}`,
        timestamp: 12345,
      }),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: TestResult }) => {
        update({ age: data.timestamp })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "error" })
      },
    },
  }
  const context: Ctx = { name: "test_user", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })
  await machine.update(context)
  expect(patches.length, "Должны быть получены патчи").toBeGreaterThan(0)
  expect(patches[0]?.op, "Первый патч должен быть типа test при входе в состояние с процессом").toBe("test")
  expect(patches[0]?.path, "Путь патча должен быть /state").toBe("/state")
  expect(patches[0]?.value, "Значение патча должно быть loading").toBe("loading")
  if (patches.length > 1) {
    expect(patches[1]?.op, "Второй патч должен быть типа replace после выполнения процесса").toBe("replace")
    expect(patches[1]?.path, "Путь патча должен быть /state").toBe("/state")
  }
  unsubscribe()
})

test("Machine - патчи при переходе в состояние без действия (replace)", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: {
      loading: {
        name: { length: { min: 3 } },
        isActive: true,
      },
    },
    loading: {
      success: { name: { eq: "test_user" } },
    },
    success: { idle: {} },
    error: {},
  }
  const context: Ctx = { name: "test_user", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, {}, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })
  await machine.update(context)
  expect(patches.length, "Должны быть получены патчи при переходе в состояние без действия").toBeGreaterThan(0)
  patches.forEach((patch, index) => {
    expect(patch.op, `Патч ${index + 1} должен быть типа replace для состояния без процесса`).toBe("replace")
    expect(patch.path, `Путь патча ${index + 1} должен быть /state`).toBe("/state")
  })
  unsubscribe()
})

test("Machine - патчи при ошибке в действии", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: {
      loading: {
        name: { length: { min: 3 } },
        isActive: true,
      },
    },
    loading: {
      error: { name: { eq: "error" } },
    },
    success: { idle: {} },
    error: { idle: {} },
  }
  const actionsConfig = {
    loading: {
      action: ({ context }: { context: Ctx }) => {
        throw new Error("Test error")
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "error" })
      },
    },
  }
  const context: Ctx = { name: "test_user", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })
  try {
    await machine.update(context)
  } catch (error) {
    // Ожидаем ошибку
  }
  expect(patches.length, "Должны быть получены патчи при ошибке в действии").toBeGreaterThan(0)
  expect(patches[0]?.op, "Первый патч должен быть типа test при входе в состояние с процессом").toBe("test")
  expect(patches[0]?.path, "Путь патча должен быть /state").toBe("/state")
  expect(patches[0]?.value, "Значение патча должно быть loading").toBe("loading")
  unsubscribe()
})

test("Machine - последовательность патчей в полном цикле", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: {
      loading: {
        name: { length: { min: 3 } },
        isActive: true,
      },
    },
    loading: {
      success: { age: { gt: 0 } },
    },
    success: { idle: {} },
    error: {},
  }
  const actionsConfig = {
    loading: {
      action: ({ context }: { context: Ctx }) => ({
        userId: `user_${context.name}`,
        timestamp: 12345,
      }),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: TestResult }) => {
        update({ age: data.timestamp })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "error" })
      },
    },
  }
  const context: Ctx = { name: "test_user", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })
  await machine.update(context)
  expect(patches.length, "Должна быть получена последовательность патчей").toBeGreaterThan(0)
  patches.forEach((patch, index) => {
    expect(patch.op, `Патч ${index + 1} должен иметь операцию test или replace`).toMatch(/^(test|replace)$/)
    expect(patch.path, `Патч ${index + 1} должен иметь путь /state`).toBe("/state")
    expect(patch.value, `Патч ${index + 1} должен иметь значение состояния`).toMatch(/^(idle|loading|success|error)$/)
  })
  if (patches.length >= 2) {
    expect(patches[0]?.op, "Первый патч должен быть test").toBe("test")
    expect(patches[0]?.value, "Первый патч должен быть для состояния loading").toBe("loading")
    expect(patches[1]?.op, "Второй патч должен быть replace").toBe("replace")
    expect(patches[1]?.value, "Второй патч должен быть для состояния loading или success").toMatch(
      /^(loading|success)$/
    )
  }
  unsubscribe()
})
