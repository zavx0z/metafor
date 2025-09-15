import { test, expect } from "bun:test"
import { checkTransition } from "../index.ts"

test("Простые условия для числовых значений", () => {
  const condition = { age: 25 }
  const context = { age: 25 }
  const result = checkTransition(condition, context)
  expect(result, "простое числовое условие должно быть true").toBe(true)
})

test("Условия диапазона чисел", () => {
  const condition = { age: { gte: 18, lte: 65 } }
  const context = { age: 25 }
  const result = checkTransition(condition, context)
  expect(result, "условие диапазона чисел должно быть true").toBe(true)
})
