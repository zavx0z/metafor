/**
 * Тесты для модуля parseCondition.
 *
 * Проверяет парсинг всех видов условий:
 * - Простые скалярные условия
 * - Операторы сравнения
 * - Массивы и length условия
 * - Инвертированные операторы
 */

import { test, expect, describe } from "bun:test"
import { parseCondition } from "../condition"
import { OP } from "../opcodes"

describe("parseCondition — парсинг условий", () => {
  test("должен парсить простое числовое условие", () => {
    const result = parseCondition(50)
    expect(result).toEqual([{ op: OP.EQ, val: 50 }])
  })

  test("должен парсить простое строковое условие", () => {
    const result = parseCondition("hero")
    expect(result).toEqual([{ op: OP.EQ, val: "hero" }])
  })

  test("должен парсить простое булево условие", () => {
    const result = parseCondition(true)
    expect(result).toEqual([{ op: OP.EQ, val: true }])
  })

  test("должен парсить условие gt", () => {
    const result = parseCondition({ gt: 50 })
    expect(result).toEqual([{ op: OP.GT, val: 50 }])
  })

  test("должен парсить условие lt", () => {
    const result = parseCondition({ lt: 50 })
    expect(result).toEqual([{ op: OP.LT, val: 50 }])
  })

  test("должен парсить условие gte", () => {
    const result = parseCondition({ gte: 50 })
    expect(result).toEqual([{ op: OP.GTE, val: 50 }])
  })

  test("должен парсить условие lte", () => {
    const result = parseCondition({ lte: 50 })
    expect(result).toEqual([{ op: OP.LTE, val: 50 }])
  })

  test("должен парсить условие eq", () => {
    const result = parseCondition({ eq: 50 })
    expect(result).toEqual([{ op: OP.EQ, val: 50 }])
  })

  test("должен парсить условие neq", () => {
    const result = parseCondition({ neq: 50 })
    expect(result).toEqual([{ op: OP.NEQ, val: 50 }])
  })

  test("должен парсить условие in", () => {
    const result = parseCondition({ in: [1, 2, 3] })
    expect(result).toEqual([{ op: OP.IN, val: [1, 2, 3] }])
  })

  test("должен парсить условие notIn", () => {
    const result = parseCondition({ notIn: [1, 2, 3] })
    expect(result).toEqual([{ op: OP.NOT_IN, val: [1, 2, 3] }])
  })

  test("должен парсить условие include", () => {
    const result = parseCondition({ include: 5 })
    expect(result).toEqual([{ op: OP.INCLUDE, val: 5 }])
  })

  test("должен парсить условие notInclude", () => {
    const result = parseCondition({ notInclude: 5 })
    expect(result).toEqual([{ op: OP.NOT_INCLUDE, val: 5 }])
  })

  test("должен парсить условие isEmpty", () => {
    const result = parseCondition({ isEmpty: true })
    expect(result).toEqual([{ op: OP.IS_EMPTY, val: true }])
  })

  test("должен парсить условие length (число)", () => {
    const result = parseCondition({ length: 5 })
    expect(result).toEqual([{ op: OP.LENGTH, val: 5 }])
  })

  test("должен парсить условие length (объект)", () => {
    const result = parseCondition({ length: { gt: 5 } })
    expect(result).toEqual([{ op: OP.GT, val: 5 }])
  })

  test("должен парсить условие between", () => {
    const result = parseCondition({ between: [10, 20] })
    expect(result).toEqual([
      { op: OP.GTE, val: 10 },
      { op: OP.LTE, val: 20 },
    ])
  })

  test("должен парсить условие notGt (эквивалент lte)", () => {
    const result = parseCondition({ notGt: 50 })
    expect(result).toEqual([{ op: OP.LTE, val: 50 }])
  })

  test("должен парсить условие notGte (эквивалент lt)", () => {
    const result = parseCondition({ notGte: 50 })
    expect(result).toEqual([{ op: OP.LT, val: 50 }])
  })

  test("должен парсить условие notLt (эквивалент gte)", () => {
    const result = parseCondition({ notLt: 50 })
    expect(result).toEqual([{ op: OP.GTE, val: 50 }])
  })

  test("должен парсить условие notLte (эквивалент gt)", () => {
    const result = parseCondition({ notLte: 50 })
    expect(result).toEqual([{ op: OP.GT, val: 50 }])
  })

  test("должен парсить множественные условия", () => {
    const result = parseCondition({ gt: 50, lte: 100 })
    expect(result).toEqual([
      { op: OP.GT, val: 50 },
      { op: OP.LTE, val: 100 },
    ])
  })

  test("должен парсить null как EQ", () => {
    const result = parseCondition(null)
    expect(result).toEqual([{ op: OP.EQ, val: null }])
  })
})
