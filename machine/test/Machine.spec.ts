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

test("Machine - автоматические переходы с update", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: {
      loading: {
        name: { length: { min: 3 } },
        isActive: true,
      },
    },
    loading: {
      success: { age: { gt: 0 } },
      error: { name: { eq: "error" } },
    },
    success: { idle: {} },
    error: { idle: {} },
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
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")
  const result = await machine.update(context)
  expect(result, "Результат должен содержать userId и timestamp из процесса loading").toEqual({
    userId: "user_test_user",
    timestamp: 12345,
  })
  expect(machine.currentState, "Машина должна остановиться в состоянии loading при обнаружении цикла").toBe("loading")
})

test("Machine - автоматические переходы с ошибкой", async () => {
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
      action: ({ }: { context: Ctx }) => {
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
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")
  expect(machine.update(context), "Должна быть выброшена ошибка из процесса").rejects.toThrow("Test error")
  expect(machine.currentState, "Машина должна остановиться в состоянии loading при обнаружении цикла").toBe("loading")
})

test("Machine - обработка контекста без переходов", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: { loading: { name: { length: { min: 3 } }, isActive: true } },
    loading: {},
    success: {},
    error: {},
  }
  const context: Ctx = { name: "ab", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, {}, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")
  const result = await machine.update(context)
  expect(result, "Результат должен быть undefined, так как не было выполнено ни одного процесса").toBeUndefined()
  expect(machine.currentState, "Состояние должно остаться idle, так как условия перехода не выполнены").toBe("idle")
})

test("Machine - обработка контекста с неактивным пользователем", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: { loading: { name: { length: { min: 3 } }, isActive: true } },
    loading: {},
    success: {},
    error: {},
  }
  const context: Ctx = { name: "test_user", age: null, isActive: false }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, {}, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")
  const result = await machine.update(context)
  expect(result, "Результат должен быть undefined, так как пользователь неактивен").toBeUndefined()
  expect(machine.currentState, "Состояние должно остаться idle, так как пользователь неактивен").toBe("idle")
})

test("Machine - проверка состояния выполнения", () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: { loading: {} },
    loading: {},
    success: {},
    error: {},
  }
  const context: Ctx = { name: "test", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, {}, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")
  expect(machine.isExecuting, "Машина не должна выполнять процесс в начальном состоянии").toBe(false)
})

test("Machine - подписка на обновления", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: { loading: { name: { length: { min: 3 } }, isActive: true } },
    loading: {},
    success: {},
    error: {},
  }
  const context: Ctx = { name: "test", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, {}, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  const patches: Array<{ op: "test" | "replace"; path: "/state"; value: TestStates }> = []
  const unsubscribe = machine.onUpdate((receivedPatches) => {
    receivedPatches.forEach((patch) => patches.push(patch))
  })
  await machine.update(context)
  expect(patches.length, "Должны быть получены патчи при изменении состояния").toBeGreaterThan(0)
  expect(patches[0]?.value, "Первый патч должен содержать состояние loading").toBe("loading")
  unsubscribe()
  patches.length = 0
  await machine.update(context)
  expect(patches.length, "После отписки не должно быть уведомлений").toBe(0)
})

test("Machine - проверка условий перехода", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: { loading: { name: { length: { min: 3 } }, isActive: true } },
    loading: {},
    success: {},
    error: {},
  }
  const shortNameContext: Ctx = { name: "ab", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, {}, "idle", (values) => {
    Object.assign(shortNameContext, values)
    return shortNameContext
  })
  await machine.update(shortNameContext)
  expect(machine.currentState, "Машина не должна переходить при коротком имени").toBe("idle")
  const inactiveContext: Ctx = { name: "test_user", age: null, isActive: false }
  const machine2 = new Machine<TestStates, TestContext, TestResult>(stateConfig, {}, "idle", (values) => {
    Object.assign(inactiveContext, values)
    return inactiveContext
  })
  await machine2.update(inactiveContext)
  expect(machine2.currentState, "Машина не должна переходить при неактивном пользователе").toBe("idle")
  const validContext: Ctx = { name: "test_user", age: null, isActive: true }
  const machine3 = new Machine<TestStates, TestContext, TestResult>(stateConfig, {}, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })
  await machine3.update(validContext)
  expect(machine3.currentState, "Машина должна перейти при корректных данных").toBe("loading")
})

test("Machine - проверка максимального количества итераций", async () => {
  const stateConfig: StateConfig<TestStates, TestContext> = {
    idle: { loading: {} },
    loading: { idle: {} },
    success: {},
    error: {},
  }
  const context: Ctx = { name: "test", age: null, isActive: true }
  const machine = new Machine<TestStates, TestContext, TestResult>(stateConfig, {}, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  await machine.update(context)
  expect(machine.currentState, "Машина должна остановиться в состоянии loading").toBe("loading")
})
