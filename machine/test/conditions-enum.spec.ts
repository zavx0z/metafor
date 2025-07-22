import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"
import type { ExtractValues } from "../../context"

// Тестовые типы состояний
type TestStates = "idle" | "enum_test" | "success"

// Тестовые типы контекста с enum данными
type EnumContext = {
  status: { type: "enum"; required: true; values: readonly ["active", "inactive", "pending"] }
  role: { type: "enum"; required: false; values: readonly ["admin", "user", "moderator"] }
  priority: { type: "enum"; required: true; values: readonly ["low", "medium", "high"] }
}
type Ctx = ExtractValues<EnumContext>

// Тестовый тип результата
type TestResult = {
  message: string
  timestamp: number
}

test("Machine - тесты enum условий (required и optional)", async () => {
  const stateConfig: StateConfig<TestStates, EnumContext> = {
    idle: {
      enum_test: {
        status: { eq: "active" },
        role: { null: false },
        priority: "high",
      },
    },
    enum_test: {
      success: {
        status: "active",
      },
    },
    success: {},
  }

  const actionsConfig = {
    enum_test: {
      action: ({ context }: { context: Ctx }) => ({
        message: `Enum test: status=${context.status}, role=${context.role}`,
        timestamp: Date.now(),
      }),
      success: ({ update }: { update: (v: Partial<Ctx>) => void; data: TestResult }) => {
        update({ status: "active" })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ status: "inactive" })
      },
    },
  }

  // Тест 1: Корректные enum данные
  const validContext = { status: "active" as const, role: "admin" as const, priority: "high" as const }
  const machine = new Machine<TestStates, EnumContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })

  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти в success при корректных enum данных").toBe("success")

  // Тест 2: Неактивный статус (не должно переходить)
  const inactiveContext = { status: "inactive" as const, role: "admin" as const, priority: "high" as const }
  const machine2 = new Machine<TestStates, EnumContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(inactiveContext, values)
    return inactiveContext
  })

  await machine2.update(inactiveContext)
  expect(machine2.currentState, "Машина не должна переходить при неактивном статусе").toBe("idle")

  // Тест 3: Null role (не должно переходить)
  const nullRoleContext = { status: "active" as const, role: null, priority: "high" as const }
  const machine3 = new Machine<TestStates, EnumContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(nullRoleContext, values)
    return nullRoleContext
  })

  await machine3.update(nullRoleContext)
  expect(machine3.currentState, "Машина не должна переходить при null role").toBe("idle")
})
