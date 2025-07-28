import { test, expect } from "bun:test"
import { checkTransitionConditions } from "../index.ts"
import type { StatesConfig } from "../index.t.ts"

test("checkTransitionConditions", () => {
  // Простые условия
  expect(checkTransitionConditions({ name: "John" }, { name: "John" }), "простое строковое условие").toBe(true)
  expect(checkTransitionConditions({ age: 25 }, { age: 25 }), "простое числовое условие").toBe(true)
  expect(checkTransitionConditions({ isActive: true }, { isActive: true }), "простое булево условие").toBe(true)

  // Сложные условия
  expect(checkTransitionConditions({ name: { length: { min: 2 } } }, { name: "John" }), "условие длины строки").toBe(
    true
  )

  expect(checkTransitionConditions({ age: { gte: 18, lte: 65 } }, { age: 25 }), "условие диапазона чисел").toBe(true)

  expect(
    checkTransitionConditions({ email: { pattern: /@/ } }, { email: "test@example.com" }),
    "условие регулярного выражения"
  ).toBe(true)

  // Отрицательные тесты
  expect(checkTransitionConditions({ name: "John" }, { name: "Jane" }), "несовпадение строки").toBe(false)
  expect(checkTransitionConditions({ age: 25 }, { age: 30 }), "несовпадение числа").toBe(false)
  expect(checkTransitionConditions({ isActive: true }, { isActive: false }), "несовпадение булева значения").toBe(false)
})

test("StatesConfig type", () => {
  // Проверяем, что тип StatesConfig работает корректно
  const states: StatesConfig<"guest" | "user" | "admin", any> = {
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

  expect(states.guest?.user?.name, "проверка структуры состояний").toBeDefined()
  expect(states.user?.admin?.isAdmin, "проверка булевых условий").toBe(true)
})
