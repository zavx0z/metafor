import { test, expect } from "bun:test"
import { decoherence } from "../../src/states.ts"

test("Простые условия для числовых значений", () => {
  const condition = { age: 25 }
  const context = { age: 25 }
  const result = decoherence(condition, context)
  expect(result, "простое числовое условие должно быть true").toBe(true)
})

test("Условия диапазона чисел", () => {
  const condition = { age: { gte: 18, lte: 65 } }
  const context = { age: 25 }
  const result = decoherence(condition, context)
  expect(result, "условие диапазона чисел должно быть true").toBe(true)
})
