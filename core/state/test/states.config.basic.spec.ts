import { test, expect } from "bun:test"
import type { StatesConfig } from "../../../schema/states.t.ts"

test("Базовая конфигурация состояний пользователя", () => {
  const userStates: StatesConfig = {
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
