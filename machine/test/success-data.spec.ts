import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StatesConfig } from "../index.t.ts"
import type { ExtractValues } from "../../context"

type TestStates = "idle" | "loading" | "processing" | "success" | "error"
type TestContext = {
  name: { type: "string"; required: true }
  email: { type: "string"; required: false }
  isActive: { type: "boolean"; required: true }
  age: { type: "number"; required: false }
}
type Ctx = ExtractValues<TestContext>
type UserResult = {
  userId: string
  profile: {
    name: string
    email: string
    createdAt: Date
  }
  permissions: string[]
}
type ProductResult = {
  productId: string
  details: {
    name: string
    price: number
    category: string
    inStock: boolean
  }
  metadata: {
    tags: string[]
    rating: number
    reviews: number
  }
}
type OrderResult = {
  orderNumber: string
  summary: {
    totalItems: number
    totalAmount: number
    currency: string
  }
  timeline: {
    created: Date
    updated: Date
    estimatedDelivery: Date
  }
}
type SimpleResult = {
  message: string
  timestamp: number
}
type ComplexResult = {
  data: {
    primary: {
      id: string
      value: number
      nested: {
        flag: boolean
        items: string[]
      }
    }
    secondary: {
      count: number
      results: Array<{
        key: string
        score: number
      }>
    }
  }
  meta: {
    version: string
    checksum: string
    processed: boolean
  }
}
type ErrorResult = {
  error: string
  code: number
  details: {
    field: string
    message: string
  }
}
type CombinedResult = UserResult | ProductResult | OrderResult | SimpleResult | ComplexResult | ErrorResult

test("Machine - различные форматы данных в разных состояниях", async () => {
  const stateConfig: StatesConfig<TestStates, TestContext> = {
    idle: {
      loading: {
        name: { length: { min: 3 } },
        isActive: true,
      },
    },
    loading: {
      processing: { age: { gt: 0 } },
      error: { name: { eq: "error_user" } },
    },
    processing: {
      success: { age: { gt: 100 } },
      error: { name: { eq: "error_product" } },
    },
    success: { idle: {} },
    error: { idle: {} },
  }
  const actionsConfig = {
    loading: {
      action: ({ context }: { context: Ctx }) =>
        ({
          userId: `user_${Date.now()}`,
          profile: {
            name: context.name,
            email: context.email || "default@example.com",
            createdAt: new Date(),
          },
          permissions: ["read", "write", "admin"],
        } as UserResult),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: UserResult }) => {
        expect(data.userId, "userId должен быть строкой").toMatch(/^user_\d+$/)
        expect(data.profile.name, "profile.name должен соответствовать контексту").toBe(context.name)
        expect(data.permissions, "permissions должен быть массивом").toEqual(["read", "write", "admin"])
        expect(data.profile.createdAt, "createdAt должен быть Date").toBeInstanceOf(Date)
        update({ name: data.profile.name })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "error_user" })
      },
    },
    processing: {
      action: ({ context }: { context: Ctx }) =>
        ({
          productId: `prod_${context.name}`,
          details: {
            name: context.name,
            price: 99.99,
            category: "test",
            inStock: true,
          },
          metadata: {
            tags: ["featured", "popular"],
            rating: 4.5,
            reviews: 128,
          },
        } as ProductResult),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: ProductResult }) => {
        expect(data.productId, "productId должен соответствовать контексту").toBe(`prod_${context.name}`)
        expect(data.details.price, "price должен быть 99.99").toBe(99.99)
        expect(data.details.inStock, "inStock должен быть true").toBe(true)
        expect(data.metadata.tags, "tags должен быть массивом").toEqual(["featured", "popular"])
        expect(data.metadata.rating, "rating должен быть 4.5").toBe(4.5)
        update({ age: data.metadata.reviews })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "error_product" })
      },
    },
    success: {
      action: ({ context }: { context: Ctx }) =>
        ({
          orderNumber: `ORD-${context.name}`,
          summary: {
            totalItems: 3,
            totalAmount: 299.99,
            currency: "USD",
          },
          timeline: {
            created: new Date(),
            updated: new Date(),
            estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        } as OrderResult),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: OrderResult }) => {
        expect(data.orderNumber, "orderNumber должен соответствовать контексту").toBe(`ORD-${context.name}`)
        expect(data.summary.totalItems, "totalItems должен быть 3").toBe(3)
        expect(data.summary.totalAmount, "totalAmount должен быть 299.99").toBe(299.99)
        expect(data.summary.currency, "currency должен быть USD").toBe("USD")
        expect(data.timeline.estimatedDelivery.getTime(), "estimatedDelivery должен быть в будущем").toBeGreaterThan(
          new Date().getTime()
        )
        update({ name: data.orderNumber })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "error_order" })
      },
    },
    error: {
      action: ({ context }: { context: Ctx }) =>
        ({
          error: "Test error occurred",
          code: 500,
          details: {
            field: "name",
            message: `Error processing ${context.name}`,
          },
        } as ErrorResult),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: ErrorResult }) => {
        expect(data.error, "error должен быть строкой").toBe("Test error occurred")
        expect(data.code, "code должен быть 500").toBe(500)
        expect(data.details.field, "details.field должен быть name").toBe("name")
        expect(data.details.message, "details.message должен содержать имя").toContain(context.name)
        update({ name: "error_handled" })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "critical_error" })
      },
    },
  }
  const context: Ctx = { name: "test_user", email: "test@example.com", isActive: true, age: 150 }
  const machine = new Machine<TestStates, TestContext>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")
  await machine.update(context)
  // Проверяем, что имя обновлено в success (см. update({ name: data.profile.name }) и далее update({ name: data.orderNumber }))
  expect(context.name, "Контекст должен быть обновлён до имени заказа").toBe(`ORD-test_user`)
  // Ожидаемое финальное состояние с учётом переходов и обновления контекста
  expect(machine.currentState, "Машина должна быть в состоянии loading").toBe("loading")
})

test("Machine - обработка ошибок с различными форматами данных", async () => {
  const stateConfig: StatesConfig<TestStates, TestContext> = {
    idle: {
      loading: {
        name: { length: { min: 3 } },
        isActive: true,
      },
    },
    loading: {
      error: { name: { eq: "error_user" } },
    },
    processing: {},
    success: {},
    error: { idle: {} },
  }
  const actionsConfig = {
    loading: {
      action: ({}: { context: Ctx }) => {
        throw new Error("Loading error")
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "error_user" })
      },
    },
    error: {
      action: ({ context }: { context: Ctx }) =>
        ({
          error: "Test error occurred",
          code: 500,
          details: {
            field: "name",
            message: `Error processing ${context.name}`,
          },
        } as ErrorResult),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: ErrorResult }) => {
        expect(data.error, "error должен быть строкой").toBe("Test error occurred")
        expect(data.code, "code должен быть 500").toBe(500)
        expect(data.details.field, "details.field должен быть name").toBe("name")
        expect(data.details.message, "details.message должен содержать имя").toContain(context.name)
        update({ name: "error_handled" })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "critical_error" })
      },
    },
  }
  const context: Ctx = { name: "test_user", email: "test@example.com", isActive: true, age: null }
  const machine = new Machine<TestStates, TestContext>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")
  await expect(machine.update(context), "Должна быть выброшена ошибка из процесса loading").rejects.toThrow(
    "Loading error"
  )
  // После error update({ name: "error_user" })
  expect(context.name, "Контекст должен быть обновлён до error_user").toBe("error_user")
  expect(machine.currentState, "Машина должна остановиться в состоянии loading при обнаружении цикла").toBe("loading")
})

test("Machine - простые и сложные данные в разных состояниях", async () => {
  const stateConfig: StatesConfig<TestStates, TestContext> = {
    idle: {
      loading: {
        name: { length: { min: 3 } },
        isActive: true,
      },
    },
    loading: {
      processing: { age: { gt: 0 } },
    },
    processing: {
      success: {},
    },
    success: {},
    error: {},
  }
  const actionsConfig = {
    loading: {
      action: ({ context }: { context: Ctx }) =>
        ({
          message: `Hello, ${context.name}!`,
          timestamp: Date.now(),
        } as SimpleResult),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: SimpleResult }) => {
        expect(data.message, "message должен содержать имя пользователя").toContain(context.name)
        expect(typeof data.timestamp, "timestamp должен быть числом").toBe("number")
        expect(data.timestamp, "timestamp должен быть положительным").toBeGreaterThan(0)
        update({ name: context.name })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "error" })
      },
    },
    processing: {
      action: ({ context }: { context: Ctx }) =>
        ({
          data: {
            primary: {
              id: `complex_${context.name}`,
              value: context.name.length * 10,
              nested: {
                flag: context.isActive,
                items: context.name.split("").map((char: string, index: number) => `${char}_${index}`),
              },
            },
            secondary: {
              count: context.name.length,
              results: context.name.split("").map((char: string, index: number) => ({
                key: char,
                score: index + 1,
              })),
            },
          },
          meta: {
            version: "1.0.0",
            checksum: `hash_${context.name}`,
            processed: true,
          },
        } as ComplexResult),
      success: ({ update, data }: { update: (v: Partial<Ctx>) => void; data: ComplexResult }) => {
        expect(data.data.primary.id, "primary.id должен соответствовать контексту").toBe(`complex_${context.name}`)
        expect(data.data.primary.value, "primary.value должен быть вычислен").toBe(context.name.length * 10)
        expect(data.data.primary.nested.flag, "nested.flag должен соответствовать isActive").toBe(context.isActive)
        expect(Array.isArray(data.data.primary.nested.items), "nested.items должен быть массивом").toBe(true)
        expect(Array.isArray(data.data.secondary.results), "secondary.results должен быть массивом объектов").toBe(true)
        expect(data.meta.processed, "meta.processed должен быть true").toBe(true)
        update({ name: data.data.primary.id })
      },
      error: ({ update }: { update: (v: Partial<Ctx>) => void }) => {
        update({ name: "complex_error" })
      },
    },
  }
  const context: Ctx = { name: "Bob", email: null, isActive: true, age: 25 }
  const machine = new Machine<TestStates, TestContext>(stateConfig, actionsConfig, "idle", (values) => {
    Object.assign(context, values)
    return context
  })
  await machine.update(context)
  // После success update({ name: data.data.primary.id })
  expect(context.name, "Контекст должен быть обновлён до complex_Bob").toBe("complex_Bob")
  // Ожидаемое финальное состояние с учётом переходов и обновления контекста
  expect(machine.currentState, "Машина должна быть в состоянии success").toBe("success")
})
