import { test, expect } from "bun:test"
import { checkTransitionConditions } from "../index.ts"

test("Простые условия для строковых значений", () => {
  const condition = { name: "John" }
  const context = { name: "John" }
  const result = checkTransitionConditions(condition, context)
  expect(result, "простое строковое условие должно быть true").toBe(true)
})

test("Простые условия для числовых значений", () => {
  const condition = { age: 25 }
  const context = { age: 25 }
  const result = checkTransitionConditions(condition, context)
  expect(result, "простое числовое условие должно быть true").toBe(true)
})

test("Простые условия для булевых значений", () => {
  const condition = { isActive: true }
  const context = { isActive: true }
  const result = checkTransitionConditions(condition, context)
  expect(result, "простое булево условие должно быть true").toBe(true)
})

test("Условия длины строки", () => {
  const condition = { name: { length: { min: 2 } } }
  const context = { name: "John" }
  const result = checkTransitionConditions(condition, context)
  expect(result, "условие длины строки должно быть true").toBe(true)
})

test("Условия диапазона чисел", () => {
  const condition = { age: { gte: 18, lte: 65 } }
  const context = { age: 25 }
  const result = checkTransitionConditions(condition, context)
  expect(result, "условие диапазона чисел должно быть true").toBe(true)
})

test("Условия регулярного выражения", () => {
  const condition = { email: { pattern: /@/ } }
  const context = { email: "test@example.com" }
  const result = checkTransitionConditions(condition, context)
  expect(result, "условие регулярного выражения должно быть true").toBe(true)
})

test("Отрицательные тесты - несовпадение строки", () => {
  const condition = { name: "John" }
  const context = { name: "Jane" }
  const result = checkTransitionConditions(condition, context)
  expect(result, "несовпадение строки должно быть false").toBe(false)
})

test("Отрицательные тесты - несовпадение числа", () => {
  const condition = { age: 25 }
  const context = { age: 30 }
  const result = checkTransitionConditions(condition, context)
  expect(result, "несовпадение числа должно быть false").toBe(false)
})

test("Отрицательные тесты - несовпадение булева значения", () => {
  const condition = { isActive: true }
  const context = { isActive: false }
  const result = checkTransitionConditions(condition, context)
  expect(result, "несовпадение булева значения должно быть false").toBe(false)
})
