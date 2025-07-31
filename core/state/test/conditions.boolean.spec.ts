import { test, expect } from "bun:test"
import { checkTransitionConditions } from "../index.ts"

test("Простые условия для булевых значений", () => {
  const condition = { isActive: true }
  const context = { isActive: true }
  const result = checkTransitionConditions(condition, context)
  expect(result, "простое булево условие должно быть true").toBe(true)
})
