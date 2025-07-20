import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"

// Тестовые типы для различных форматов данных
type TestStates = "idle" | "loading" | "processing" | "success" | "error"

// Контекст для тестов
type TestContext = {
  name: { type: "string"; required: true }
  email: { type: "string"; required: false }
  isActive: { type: "boolean"; required: true }
  age: { type: "number"; required: false }
}

// Различные типы результатов для разных состояний
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

// Объединенный тип результатов для машины
type CombinedResult = UserResult | ProductResult | OrderResult | SimpleResult | ComplexResult | ErrorResult

test("Machine - различные форматы данных в разных состояниях", async () => {
  const config: StateConfig<TestStates, TestContext, CombinedResult> = {
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
        action: ({ context }) =>
          ({
            userId: `user_${Date.now()}`,
            profile: {
              name: context.name,
              email: context.email || "default@example.com",
              createdAt: new Date(),
            },
            permissions: ["read", "write", "admin"],
          } as UserResult),
        success: ({ update, data }) => {
          // data имеет тип UserResult
          const userData = data as UserResult
          expect(userData.userId, "userId должен быть строкой").toMatch(/^user_\d+$/)
          expect(userData.profile.name, "profile.name должен соответствовать контексту").toBe(context.name)
          expect(userData.permissions, "permissions должен быть массивом").toEqual(["read", "write", "admin"])
          expect(userData.profile.createdAt, "createdAt должен быть Date").toBeInstanceOf(Date)

          update({ name: userData.profile.name })
        },
        error: ({ update }) => {
          update({ name: "error_user" })
        },
      },
      to: {
        processing: {
          age: { gt: 0 },
        },
        error: {
          name: { eq: "error_user" },
        },
      },
    },
    processing: {
      process: {
        action: ({ context }) =>
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
        success: ({ update, data }) => {
          // data имеет тип ProductResult
          const productData = data as ProductResult
          expect(productData.productId, "productId должен соответствовать контексту").toBe(`prod_${context.name}`)
          expect(productData.details.price, "price должен быть 99.99").toBe(99.99)
          expect(productData.details.inStock, "inStock должен быть true").toBe(true)
          expect(productData.metadata.tags, "tags должен быть массивом").toEqual(["featured", "popular"])
          expect(productData.metadata.rating, "rating должен быть 4.5").toBe(4.5)

          update({ age: productData.metadata.reviews })
        },
        error: ({ update }) => {
          update({ name: "error_product" })
        },
      },
      to: {
        success: {
          age: { gt: 100 },
        },
        error: {
          name: { eq: "error_product" },
        },
      },
    },
    success: {
      process: {
        action: ({ context }) =>
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
              estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 дней
            },
          } as OrderResult),
        success: ({ update, data }) => {
          // data имеет тип OrderResult
          const orderData = data as OrderResult
          expect(orderData.orderNumber, "orderNumber должен соответствовать контексту").toBe(`ORD-${context.name}`)
          expect(orderData.summary.totalItems, "totalItems должен быть 3").toBe(3)
          expect(orderData.summary.totalAmount, "totalAmount должен быть 299.99").toBe(299.99)
          expect(
            orderData.timeline.estimatedDelivery.getTime(),
            "estimatedDelivery должен быть в будущем"
          ).toBeGreaterThan(new Date().getTime())

          update({ name: orderData.orderNumber })
        },
        error: ({ update }) => {
          update({ name: "error_order" })
        },
      },
      to: {
        idle: {},
      },
    },
    error: {
      process: {
        action: ({ context }) =>
          ({
            error: "Test error occurred",
            code: 500,
            details: {
              field: "name",
              message: `Error processing ${context.name}`,
            },
          } as ErrorResult),
        success: ({ update, data }) => {
          // data имеет тип ErrorResult
          const errorData = data as ErrorResult
          expect(errorData.error, "error должен быть строкой").toBe("Test error occurred")
          expect(errorData.code, "code должен быть 500").toBe(500)
          expect(errorData.details.field, "details.field должен быть name").toBe("name")
          expect(errorData.details.message, "details.message должен содержать имя").toContain(context.name)

          update({ name: "error_handled" })
        },
        error: ({ update }) => {
          update({ name: "critical_error" })
        },
      },
      to: {
        idle: {},
      },
    },
  }

  const context = { name: "test_user", email: "test@example.com", isActive: true, age: 150 }
  const machine = new Machine<TestStates, TestContext, CombinedResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  // Начальное состояние
  expect(machine.currentState, "Машина должна начинать с состояния idle").toBe("idle")

  // Обрабатываем контекст - должны автоматически перейти через idle -> loading -> processing -> success -> idle
  const result = await machine.update(context)

  // Проверяем, что результат соответствует последнему выполненному процессу (success)
  expect(result, "Результат должен содержать данные из процесса success").toBeDefined()

  // Проверяем, что результат имеет правильный тип OrderResult
  if ("orderNumber" in result!) {
    expect(result.orderNumber, "orderNumber должен быть ORD-test_user").toBe("ORD-test_user")
    expect(result.summary.totalItems, "totalItems должен быть 3").toBe(3)
    expect(result.summary.currency, "currency должен быть USD").toBe("USD")
  } else {
    throw new Error("Результат должен быть типа OrderResult")
  }
})

test("Machine - обработка ошибок с различными форматами данных", async () => {
  const config: StateConfig<TestStates, TestContext, CombinedResult> = {
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
          throw new Error("Loading error")
        },
        error: ({ update }) => {
          update({ name: "error_user" })
        },
      },
      to: {
        error: {
          name: { eq: "error_user" },
        },
      },
    },
    processing: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      process: {
        action: ({ context }) =>
          ({
            error: "Test error occurred",
            code: 500,
            details: {
              field: "name",
              message: `Error processing ${context.name}`,
            },
          } as ErrorResult),
        success: ({ update, data }) => {
          // data имеет тип ErrorResult
          const errorData = data as ErrorResult
          expect(errorData.error, "error должен быть строкой").toBe("Test error occurred")
          expect(errorData.code, "code должен быть 500").toBe(500)
          expect(errorData.details.field, "details.field должен быть name").toBe("name")
          expect(errorData.details.message, "details.message должен содержать имя").toContain(context.name)

          update({ name: "error_handled" })
        },
        error: ({ update }) => {
          update({ name: "critical_error" })
        },
      },
      to: {
        idle: {},
      },
    },
  }

  const context = { name: "test_user", email: "test@example.com", isActive: true, age: null }
  const machine = new Machine<TestStates, TestContext, CombinedResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  // Обрабатываем контекст с ошибкой - должны перейти idle -> loading -> error -> idle
  expect(machine.update(context), "Должна быть выброшена ошибка из процесса loading").rejects.toThrow("Loading error")

  // Проверяем, что машина остановилась в состоянии loading (из-за обнаружения цикла)
  expect(machine.currentState, "Машина должна остановиться в состоянии loading при обнаружении цикла").toBe("loading")
})

test("Machine - простые и сложные данные в разных состояниях", async () => {
  const config: StateConfig<TestStates, TestContext, CombinedResult> = {
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
        action: ({ context }) =>
          ({
            message: `Hello, ${context.name}!`,
            timestamp: Date.now(),
          } as SimpleResult),
        success: ({ update, data }) => {
          // data имеет тип SimpleResult
          const simpleData = data as SimpleResult
          expect(simpleData.message, "message должен содержать имя пользователя").toContain(context.name)
          expect(simpleData.timestamp, "timestamp должен быть числом").toBeTypeOf("number")
          expect(simpleData.timestamp, "timestamp должен быть положительным").toBeGreaterThan(0)

          update({ name: context.name })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        processing: {
          age: { gt: 0 },
        },
      },
    },
    processing: {
      process: {
        action: ({ context }) =>
          ({
            data: {
              primary: {
                id: `complex_${context.name}`,
                value: context.name.length * 10,
                nested: {
                  flag: context.isActive,
                  items: context.name.split("").map((char, index) => `${char}_${index}`),
                },
              },
              secondary: {
                count: context.name.length,
                results: context.name.split("").map((char, index) => ({
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
        success: ({ update, data }) => {
          // data имеет тип ComplexResult
          const complexData = data as ComplexResult
          expect(complexData.data.primary.id, "primary.id должен соответствовать контексту").toBe(
            `complex_${context.name}`
          )
          expect(complexData.data.primary.value, "primary.value должен быть вычислен").toBe(context.name.length * 10)
          expect(complexData.data.primary.nested.flag, "nested.flag должен соответствовать isActive").toBe(
            context.isActive
          )
          expect(complexData.data.primary.nested.items, "nested.items должен быть массивом").toBeInstanceOf(Array)
          expect(complexData.data.secondary.results, "secondary.results должен быть массивом объектов").toBeInstanceOf(
            Array
          )
          expect(complexData.meta.processed, "meta.processed должен быть true").toBe(true)

          update({ name: complexData.data.primary.id })
        },
        error: ({ update }) => {
          update({ name: "complex_error" })
        },
      },
      to: {
        success: {},
      },
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const context = { name: "Bob", email: null, isActive: true, age: 25 }
  const machine = new Machine<TestStates, TestContext, CombinedResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  const result = await machine.update(context)

  // Проверяем, что результат соответствует последнему выполненному процессу (processing)
  expect(result, "Результат должен содержать данные из процесса processing").toBeDefined()

  // Проверяем, что результат имеет правильный тип ComplexResult
  if ("data" in result! && "meta" in result!) {
    expect(result.data.primary.id, "primary.id должен быть complex_Bob").toBe("complex_Bob")
    expect(result.data.primary.value, "primary.value должен быть 30").toBe(30)
    expect(result.data.primary.nested.items, "nested.items должен содержать 3 элемента").toHaveLength(3)
    expect(result.data.secondary.results, "secondary.results должен содержать 3 элемента").toHaveLength(3)
    expect(result.meta.version, "meta.version должен быть 1.0.0").toBe("1.0.0")
  } else {
    throw new Error("Результат должен быть типа ComplexResult")
  }
})
