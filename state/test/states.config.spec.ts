import { test, expect } from "bun:test"
import type { StatesConfig } from "../index.t.ts"

test("Базовая конфигурация состояний пользователя", () => {
  const userStates: StatesConfig<"guest" | "user" | "admin", any> = {
    guest: {
      user: {
        name: { length: { min: 2 } },
        email: { pattern: /@/ },
      },
    },
    user: {
      admin: { isAdmin: true },
      guest: { logout: true },
    },
    admin: {
      user: { isAdmin: false },
    },
  }

  expect(userStates.guest?.user?.name, "проверка структуры состояний").toBeDefined()
  expect(userStates.user?.admin?.isAdmin, "проверка булевых условий").toBe(true)
  expect(userStates.admin?.user?.isAdmin, "проверка отрицательных булевых условий").toBe(false)
})

test("Конфигурация состояний заказа", () => {
  const orderStates: StatesConfig<"pending" | "confirmed" | "shipped" | "delivered", any> = {
    pending: {
      confirmed: { paymentReceived: true },
    },
    confirmed: {
      shipped: { inventoryAvailable: true },
    },
    shipped: {
      delivered: { deliveryCompleted: true },
    },
    delivered: {}, // Конечное состояние без переходов
  }

  expect(orderStates.pending?.confirmed?.paymentReceived, "проверка перехода pending -> confirmed").toBe(true)
  expect(orderStates.confirmed?.shipped?.inventoryAvailable, "проверка перехода confirmed -> shipped").toBe(true)
  expect(orderStates.shipped?.delivered?.deliveryCompleted, "проверка перехода shipped -> delivered").toBe(true)
  expect(Object.keys(orderStates.delivered || {}), "проверка конечного состояния").toHaveLength(0)
})

test("Конфигурация состояний с числовыми условиями", () => {
  const gameStates: StatesConfig<"menu" | "playing" | "paused" | "gameOver", any> = {
    menu: {
      playing: { level: { gte: 1 } },
    },
    playing: {
      paused: { pauseRequested: true },
      gameOver: { lives: { lte: 0 } },
    },
    paused: {
      playing: { resumeRequested: true },
      menu: { exitToMenu: true },
    },
    gameOver: {
      menu: { restartRequested: true },
    },
  }

  expect(gameStates.menu?.playing?.level?.gte, "проверка числового условия level >= 1").toBe(1)
  expect(gameStates.playing?.gameOver?.lives?.lte, "проверка числового условия lives <= 0").toBe(0)
  expect(gameStates.playing?.paused?.pauseRequested, "проверка булевого условия pauseRequested").toBe(true)
})

test("Конфигурация состояний с множественными переходами", () => {
  const authStates: StatesConfig<"anonymous" | "authenticated" | "verified" | "blocked", any> = {
    anonymous: {
      authenticated: {
        username: { length: { min: 3 } },
        password: { length: { min: 8 } },
      },
    },
    authenticated: {
      verified: { emailVerified: true },
      blocked: { suspiciousActivity: true },
    },
    verified: {
      blocked: { violationDetected: true },
    },
    blocked: {}, // Конечное состояние
  }

  expect(authStates.anonymous?.authenticated?.username?.length?.min, "проверка минимальной длины username").toBe(3)
  expect(authStates.anonymous?.authenticated?.password?.length?.min, "проверка минимальной длины password").toBe(8)
  expect(authStates.authenticated?.verified?.emailVerified, "проверка перехода к verified").toBe(true)
  expect(authStates.authenticated?.blocked?.suspiciousActivity, "проверка перехода к blocked").toBe(true)
})
