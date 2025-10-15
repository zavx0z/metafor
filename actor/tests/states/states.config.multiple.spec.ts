import { test, expect } from "bun:test"
import type { StatesConfig } from "../../../meta/states.t.ts"

test("Конфигурация состояний с множественными переходами", () => {
  const authStates: StatesConfig = {
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

  // @ts-ignore
  expect(authStates.anonymous?.authenticated?.username?.length?.min, "проверка минимальной длины username").toBe(3)
  // @ts-ignore
  expect(authStates.anonymous?.authenticated?.password?.length?.min, "проверка минимальной длины password").toBe(8)
  expect(authStates.authenticated?.verified?.emailVerified, "проверка перехода к verified").toBe(true)
  expect(authStates.authenticated?.blocked?.suspiciousActivity, "проверка перехода к blocked").toBe(true)
})
