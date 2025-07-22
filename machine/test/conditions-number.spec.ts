import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"
import type { ExtractValues } from "../../context"

// Тестовые типы состояний
type TestStates = "idle" | "number_test" | "success"

// Тестовые типы контекста с числовыми данными
type NumberContext = {
  age: { type: "number"; required: true }
  score: { type: "number"; required: false }
  rating: { type: "number"; required: true }
  price: { type: "number"; required: false }
}
type Ctx = ExtractValues<NumberContext>

// Тестовый тип результата
type TestResult = {
  message: string
  timestamp: number
}

test("Machine - тесты числовых условий (required и optional)", async () => {
  const stateConfig: StateConfig<TestStates, NumberContext> = {
    idle: {
      number_test: {
        age: { gte: 18 },
        score: { gt: 0 },
        rating: { between: [1, 5] },
      },
    },
    number_test: {
      success: {
        price: { gt: 0 },
      },
    },
    success: {},
  }

  const actionsConfig = {
    number_test: {
      action: ({ context }: { context: Ctx }) => ({
        message: `Number test: age=${context.age}, score=${context.score}`,
        timestamp: Date.now(),
      }),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: TestResult }) => {
        update({ price: data.timestamp })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ age: 0 })
      },
    },
  }

  // Тест 1: Корректные числовые данные
  const validContext: Ctx = { age: 25, score: 85, rating: 4, price: null }
  const machine = new Machine<TestStates, NumberContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })

  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти в success при корректных числовых данных").toBe("success")

  // Тест 2: Недостаточный возраст (не должно переходить)
  const youngContext: Ctx = { age: 16, score: 85, rating: 4, price: null }
  const machine2 = new Machine<TestStates, NumberContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(youngContext, values)
    return youngContext
  })

  await machine2.update(youngContext)
  expect(machine2.currentState, "Машина не должна переходить при недостаточном возрасте").toBe("idle")

  // Тест 3: Низкий рейтинг (не должно переходить)
  const lowRatingContext: Ctx = { age: 25, score: 85, rating: 0, price: null }
  const machine3 = new Machine<TestStates, NumberContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(lowRatingContext, values)
    return lowRatingContext
  })

  await machine3.update(lowRatingContext)
  expect(machine3.currentState, "Машина не должна переходить при низком рейтинге").toBe("idle")
})

test("Machine - тесты сложных числовых условий", async () => {
  const stateConfig: StateConfig<TestStates, NumberContext> = {
    idle: {
      number_test: {
        age: {
          gte: 18,
          lte: 65,
          notEq: 0,
          notGt: 100,
          notLt: 0,
          between: [18, 65],
        },
        score: {
          gt: 0,
          lt: 101,
          notEq: 0,
          notGte: 101,
          notLte: 0,
        },
        rating: {
          eq: 5,
          notEq: 0,
          notGt: 5,
          notLt: 1,
        },
      },
    },
    number_test: {
      success: {
        price: { gt: 0 },
      },
    },
    success: {},
  }

  const actionsConfig = {
    number_test: {
      action: ({ context }: { context: Ctx }) => ({
        message: `Complex number test: age=${context.age}, score=${context.score}`,
        timestamp: Date.now(),
      }),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: TestResult }) => {
        update({ price: data.timestamp })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ age: 0 })
      },
    },
  }

  // Тест 1: Корректные сложные числовые данные
  const validContext: Ctx = { age: 25, score: 85, rating: 5, price: null }
  const machine = new Machine<TestStates, NumberContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(validContext, values)
    return validContext
  })

  await machine.update(validContext)
  expect(machine.currentState, "Машина должна перейти в success при корректных сложных числовых данных").toBe("success")

  // Тест 2: Возраст вне диапазона (не должно переходить)
  const invalidAgeContext: Ctx = { age: 70, score: 85, rating: 5, price: null }
  const machine2 = new Machine<TestStates, NumberContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(invalidAgeContext, values)
    return invalidAgeContext
  })

  await machine2.update(invalidAgeContext)
  expect(machine2.currentState, "Машина не должна переходить при возрасте вне диапазона").toBe("idle")

  // Тест 3: Низкий рейтинг (не должно переходить)
  const lowRatingContext: Ctx = { age: 25, score: 85, rating: 3, price: null }
  const machine3 = new Machine<TestStates, NumberContext, TestResult>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(lowRatingContext, values)
    return lowRatingContext
  })

  await machine3.update(lowRatingContext)
  expect(machine3.currentState, "Машина не должна переходить при низком рейтинге").toBe("idle")
})
