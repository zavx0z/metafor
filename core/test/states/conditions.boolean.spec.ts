import { test, expect } from "bun:test"
import { checkTransition } from "../../states.ts"

test("Простые условия для булевых значений", () => {
  const condition = { isActive: true }
  const context = { isActive: true }
  const result = checkTransition(condition, context)
  expect(result, "простое булево условие должно быть true").toBe(true)
})
