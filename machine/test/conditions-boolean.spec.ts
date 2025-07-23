import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StatesConfig } from "../index.t.ts"
import type { ActionsConfig } from "../../actions/index.t.ts"

// Тестовые типы состояний
type TestStates = "idle" | "boolean_test" | "success"

// Тестовые типы контекста с булевыми данными
type BooleanContext = {
  isActive: { type: "boolean"; required: true }
  isVerified: { type: "boolean"; required: false }
  hasPermission: { type: "boolean"; required: true }
}

test("Machine - тесты булевых условий (required и optional)", async () => {
  const stateConfig: StatesConfig<TestStates, BooleanContext> = {
    idle: {
      boolean_test: {
        isActive: true,
        isVerified: { eq: true },
        hasPermission: { logicalEq: true },
      },
    },
    boolean_test: {
      success: {
        hasPermission: true,
      },
    },
    success: {},
  }

  const actionsConfig: ActionsConfig<BooleanContext, TestStates> = {
    boolean_test: {
      action: ({ context }) => ({
        message: `Boolean test: active=${context.isActive}, verified=${context.isVerified}`,
        timestamp: Date.now(),
      }),
      success: ({ update }) => {
        update({ hasPermission: true })
      },
      error: ({ update }) => {
        update({ isActive: false })
      },
    },
  }

  // Тест 1: Корректные булевы данные
  const validContext = { isActive: true, isVerified: true, hasPermission: false }
  const machine = new Machine<TestStates, BooleanContext>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })

  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти в idle при корректных булевых данных").toBe("idle")

  // Тест 2: Неактивный пользователь (не должно переходить)
  const inactiveContext = { isActive: false, isVerified: true, hasPermission: false }
  const machine2 = new Machine<TestStates, BooleanContext>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(inactiveContext, values)
    return inactiveContext
  })

  await machine2.update(inactiveContext)
  expect(machine2.currentState, "Машина не должна переходить при неактивном пользователе").toBe("idle")

  // Тест 3: Неверифицированный пользователь (не должно переходить)
  const unverifiedContext = { isActive: true, isVerified: false, hasPermission: false }
  const machine3 = new Machine<TestStates, BooleanContext>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(unverifiedContext, values)
    return unverifiedContext
  })

  await machine3.update(unverifiedContext)
  expect(machine3.currentState, "Машина не должна переходить при неверифицированном пользователе").toBe("idle")
})
