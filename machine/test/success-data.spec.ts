import { test, expect } from "bun:test"
import { Machine } from "../index.ts"
import type { StateConfig } from "../index.t.ts"

// Тестовые типы для различных форматов данных
type TestStates = "idle" | "loading" | "processing" | "success" | "error"

// Различные типы контекстов
type UserContext = {
  name: { type: "string"; required: true }
  email: { type: "string"; required: false }
  isActive: { type: "boolean"; required: true }
}

type ProductContext = {
  id: { type: "string"; required: true }
  name: { type: "string"; required: true }
  price: { type: "number"; required: true }
  category: { type: "string"; required: false }
}

type OrderContext = {
  orderId: { type: "string"; required: true }
  items: { type: "array"; required: true }
  total: { type: "number"; required: true }
  status: { type: "string"; required: true }
}

// Различные типы результатов
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

test("Machine - различные форматы данных в success", async () => {
  const config: StateConfig<TestStates, UserContext, UserResult> = {
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
          userId: `user_${Date.now()}`,
          profile: {
            name: context.name,
            email: context.email || "default@example.com",
            createdAt: new Date(),
          },
          permissions: ["read", "write", "admin"],
        }),
        success: ({ update, data }) => {
          // data имеет тип UserResult
          expect(data.userId, "userId должен быть строкой").toMatch(/^user_\d+$/)
          expect(data.profile.name, "profile.name должен соответствовать контексту").toBe(context.name)
          expect(data.permissions, "permissions должен быть массивом").toEqual(["read", "write", "admin"])
          expect(data.profile.createdAt, "createdAt должен быть Date").toBeInstanceOf(Date)

          update({ name: data.profile.name })
        },
        error: ({ update }) => {
          update({ name: "error_user" })
        },
      },
      to: {
        processing: {},
      },
    },
    processing: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const context = { name: "test_user", email: "test@example.com", isActive: true }
  const machine = new Machine<TestStates, UserContext, UserResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  const result = await machine.update(context)

  expect(result, "Должен быть получен результат типа UserResult").toBeDefined()
  expect(result?.userId, "userId должен быть определен").toBeDefined()
  expect(result?.profile, "profile должен быть определен").toBeDefined()
  expect(result?.permissions, "permissions должен быть массивом").toBeInstanceOf(Array)
})

test("Machine - сложные объекты в success", async () => {
  const config: StateConfig<TestStates, ProductContext, ProductResult> = {
    idle: {
      to: {
        loading: {
          name: { length: { min: 3 } },
        },
      },
    },
    loading: {
      process: {
        action: ({ context }) => ({
          productId: `prod_${context.id}`,
          details: {
            name: context.name,
            price: context.price,
            category: context.category || "general",
            inStock: context.price > 0,
          },
          metadata: {
            tags: ["featured", "popular"],
            rating: 4.5,
            reviews: 128,
          },
        }),
        success: ({ update, data }) => {
          // data имеет тип ProductResult
          expect(data.productId, "productId должен соответствовать контексту").toBe(`prod_${context.id}`)
          expect(data.details.price, "price должен соответствовать контексту").toBe(context.price)
          expect(data.details.inStock, "inStock должен быть вычислен на основе цены").toBe(context.price > 0)
          expect(data.metadata.tags, "tags должен быть массивом").toEqual(["featured", "popular"])
          expect(data.metadata.rating, "rating должен быть числом").toBe(4.5)

          update({ name: data.details.name })
        },
        error: ({ update }) => {
          update({ name: "error_product" })
        },
      },
      to: {
        processing: {},
      },
    },
    processing: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const context = { id: "123", name: "Test Product", price: 99.99, category: "electronics" }
  const machine = new Machine<TestStates, ProductContext, ProductResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  const result = await machine.update(context)

  expect(result, "Должен быть получен результат типа ProductResult").toBeDefined()
  expect(result?.productId, "productId должен быть определен").toBe("prod_123")
  expect(result?.details.inStock, "inStock должен быть true для положительной цены").toBe(true)
  expect(result?.metadata.rating, "rating должен быть 4.5").toBe(4.5)
})

test("Machine - массивы и вложенные объекты в success", async () => {
  const config: StateConfig<TestStates, OrderContext, OrderResult> = {
    idle: {
      to: {
        loading: {
          orderId: { length: { min: 3 } },
        },
      },
    },
    loading: {
      process: {
        action: ({ context }) => ({
          orderNumber: `ORD-${context.orderId}`,
          summary: {
            totalItems: context.items.length,
            totalAmount: context.total,
            currency: "USD",
          },
          timeline: {
            created: new Date(),
            updated: new Date(),
            estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 дней
          },
        }),
        success: ({ update, data }) => {
          // data имеет тип OrderResult
          expect(data.orderNumber, "orderNumber должен соответствовать контексту").toBe(`ORD-${context.orderId}`)
          expect(data.summary.totalItems, "totalItems должен соответствовать количеству элементов").toBe(
            context.items.length
          )
          expect(data.summary.totalAmount, "totalAmount должен соответствовать контексту").toBe(context.total)
          expect(data.timeline.estimatedDelivery.getTime(), "estimatedDelivery должен быть в будущем").toBeGreaterThan(
            new Date().getTime()
          )

          update({ orderId: data.orderNumber })
        },
        error: ({ update }) => {
          update({ orderId: "error_order" })
        },
      },
      to: {
        processing: {},
      },
    },
    processing: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const context = {
    orderId: "12345",
    items: ["item1", "item2", "item3"],
    total: 299.99,
    status: "pending",
  }
  const machine = new Machine<TestStates, OrderContext, OrderResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  const result = await machine.update(context)

  expect(result, "Должен быть получен результат типа OrderResult").toBeDefined()
  expect(result?.orderNumber, "orderNumber должен быть ORD-12345").toBe("ORD-12345")
  expect(result?.summary.totalItems, "totalItems должен быть 3").toBe(3)
  expect(result?.summary.currency, "currency должен быть USD").toBe("USD")
})

test("Machine - простые типы данных в success", async () => {
  const config: StateConfig<TestStates, UserContext, SimpleResult> = {
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
          message: `Hello, ${context.name}!`,
          timestamp: Date.now(),
        }),
        success: ({ update, data }) => {
          // data имеет тип SimpleResult
          expect(data.message, "message должен содержать имя пользователя").toContain(context.name)
          expect(data.timestamp, "timestamp должен быть числом").toBeTypeOf("number")
          expect(data.timestamp, "timestamp должен быть положительным").toBeGreaterThan(0)

          update({ name: context.name })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        processing: {},
      },
    },
    processing: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const context = { name: "Alice", email: null, isActive: true }
  const machine = new Machine<TestStates, UserContext, SimpleResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  const result = await machine.update(context)

  expect(result, "Должен быть получен результат типа SimpleResult").toBeDefined()
  expect(result?.message, "message должен содержать имя Alice").toContain("Alice")
  expect(result?.timestamp, "timestamp должен быть числом").toBeTypeOf("number")
})

test("Machine - очень сложные вложенные структуры в success", async () => {
  const config: StateConfig<TestStates, UserContext, ComplexResult> = {
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
        }),
        success: ({ update, data }) => {
          // data имеет тип ComplexResult
          expect(data.data.primary.id, "primary.id должен соответствовать контексту").toBe(`complex_${context.name}`)
          expect(data.data.primary.value, "primary.value должен быть вычислен").toBe(context.name.length * 10)
          expect(data.data.primary.nested.flag, "nested.flag должен соответствовать isActive").toBe(context.isActive)
          expect(data.data.primary.nested.items, "nested.items должен быть массивом").toBeInstanceOf(Array)
          expect(data.data.secondary.results, "secondary.results должен быть массивом объектов").toBeInstanceOf(Array)
          expect(data.meta.processed, "meta.processed должен быть true").toBe(true)

          update({ name: data.data.primary.id })
        },
        error: ({ update }) => {
          update({ name: "complex_error" })
        },
      },
      to: {
        processing: {},
      },
    },
    processing: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  const context = { name: "Bob", email: null, isActive: true }
  const machine = new Machine<TestStates, UserContext, ComplexResult>(config, "idle", (values) => {
    Object.assign(context, values)
    return context
  })

  const result = await machine.update(context)

  expect(result, "Должен быть получен результат типа ComplexResult").toBeDefined()
  expect(result?.data.primary.id, "primary.id должен быть complex_Bob").toBe("complex_Bob")
  expect(result?.data.primary.value, "primary.value должен быть 30").toBe(30)
  expect(result?.data.primary.nested.items, "nested.items должен содержать 3 элемента").toHaveLength(3)
  expect(result?.data.secondary.results, "secondary.results должен содержать 3 элемента").toHaveLength(3)
  expect(result?.meta.version, "meta.version должен быть 1.0.0").toBe("1.0.0")
})

test("Machine - null и undefined значения в success", async () => {
  const config: StateConfig<TestStates, UserContext, SimpleResult> = {
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
          message: context.email || "No email provided",
          timestamp: context.email ? Date.now() : 0,
        }),
        success: ({ update, data }) => {
          // data может содержать null/undefined значения
          // Проверяем данные напрямую, без обращения к context
          expect(data.message, "message должен быть строкой").toBeTypeOf("string")
          expect(data.timestamp, "timestamp должен быть числом").toBeTypeOf("number")

          update({ name: "test_user" })
        },
        error: ({ update }) => {
          update({ name: "error" })
        },
      },
      to: {
        processing: {},
      },
    },
    processing: {
      to: {},
    },
    success: {
      to: {},
    },
    error: {
      to: {},
    },
  }

  // Тест 1: С email
  const contextWithEmail = { name: "Alice", email: "alice@example.com", isActive: true }
  const machine1 = new Machine<TestStates, UserContext, SimpleResult>(config, "idle", (values) => {
    Object.assign(contextWithEmail, values)
    return contextWithEmail
  })

  const result1 = await machine1.update(contextWithEmail)
  expect(result1?.message, "message должен содержать email").toBe("alice@example.com")
  expect(result1?.timestamp, "timestamp должен быть положительным").toBeGreaterThan(0)

  // Тест 2: Без email
  const contextWithoutEmail = { name: "Bob", email: null, isActive: true }
  const machine2 = new Machine<TestStates, UserContext, SimpleResult>(config, "idle", (values) => {
    Object.assign(contextWithoutEmail, values)
    return contextWithoutEmail
  })

  const result2 = await machine2.update(contextWithoutEmail)
  expect(result2?.message, "message должен быть дефолтным").toBe("No email provided")
  expect(result2?.timestamp, "timestamp должен быть 0").toBe(0)
})
