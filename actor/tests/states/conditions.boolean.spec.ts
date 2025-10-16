import { test, expect } from "bun:test"
import { checkTransition } from "../../strong/states.ts"

test("Простые условия для булевых значений", () => {
  const condition = { isActive: true }
  const context = { isActive: true }
  const result = checkTransition(condition, context)
  expect(result, "простое булево условие должно быть true").toBe(true)
})
test("Комплексное", () => {
  const condition = { state: { null: false }, status: true }
  const context = { state: "string", status: true }
  const result = checkTransition(condition, context)
  expect(result).toBe(true)
})
