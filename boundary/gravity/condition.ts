/**
 * Парсер JSON-условий в формат вычислительных проверок.
 *
 * Преобразует декларативные условия из superposition в последовательность
 * проверок для слабого слоя.
 *
 * @packageDocumentation
 */

import { OP } from "../weak"
import type { ConditionValue, ParsedCheck, ScalarValue } from "./condition.t"

/**
 * Парсит условие в массив проверок.
 *
 * @param cond - Условие из superposition (примитив или объект).
 * @returns Массив проверок { op, val }.
 *
 * @example
 * ```typescript
 * parseCondition(50)                    // → [{ op: OP.EQ, val: 50 }]
 * parseCondition({ gt: 50 })            // → [{ op: OP.GT, val: 50 }]
 * parseCondition({ gt: 50, lte: 100 })  // → [{ op: OP.GT, val: 50 }, { op: OP.LTE, val: 100 }]
 * parseCondition({ in: [1, 2, 3] })     // → [{ op: OP.IN, val: [1, 2, 3] }]
 * ```
 */
export function parseCondition(cond: ConditionValue): ParsedCheck[] {
  // Простое условие — прямое сравнение на равенство
  if (typeof cond !== "object" || cond === null) {
    return [{ op: OP.EQ, val: cond }]
  }

  const checks: ParsedCheck[] = []

  // Обработка сложного объекта { gt: 5, lte: 10 }
  for (const [k, v] of Object.entries(cond)) {
    const value = v as ScalarValue
    switch (k) {
      case "null":
        checks.push({ op: v === true ? OP.EQ : OP.NEQ, val: null })
        break
      case "eq":
        checks.push({ op: OP.EQ, val: value })
        break
      case "ne":
      case "notEq":
      case "neq":
        checks.push({ op: OP.NEQ, val: value })
        break
      case "gt":
        checks.push({ op: OP.GT, val: value })
        break
      case "lt":
        checks.push({ op: OP.LT, val: value })
        break
      case "gte":
        checks.push({ op: OP.GTE, val: value })
        break
      case "lte":
        checks.push({ op: OP.LTE, val: value })
        break
      case "in":
        checks.push({ op: OP.IN, val: v as ScalarValue[] })
        break
      case "notIn":
        checks.push({ op: OP.NOT_IN, val: v as ScalarValue[] })
        break
      // Array Operators
      case "include":
        checks.push({ op: OP.INCLUDE, val: value })
        break
      case "notInclude":
        checks.push({ op: OP.NOT_INCLUDE, val: value })
        break
      case "length":
        checks.push(...parseLengthCondition(v))
        break
      case "isEmpty":
        checks.push({ op: OP.IS_EMPTY, val: value })
        break
      // Atom-like extended conditions (инвертированные)
      case "notGt":
        checks.push({ op: OP.LTE, val: value }) // ! >  == <=
        break
      case "notGte":
        checks.push({ op: OP.LT, val: value }) // ! >= == <
        break
      case "notLt":
        checks.push({ op: OP.GTE, val: value }) // ! <  == >=
        break
      case "notLte":
        checks.push({ op: OP.GT, val: value }) // ! <= == >
        break
      case "between":
        if (Array.isArray(v) && v.length === 2) {
          checks.push({ op: OP.GTE, val: v[0] as ScalarValue })
          checks.push({ op: OP.LTE, val: v[1] as ScalarValue })
        }
        break
    }
  }

  return checks
}

/**
 * Парсит условие на длину массива.
 *
 * @param v - Значение условия (число или объект с операторами).
 * @returns Массив проверок.
 */
function parseLengthCondition(v: any): ParsedCheck[] {
  if (typeof v === "number") {
    return [{ op: OP.LENGTH, val: v }]
  }

  const checks: ParsedCheck[] = []

  if (typeof v === "object" && v !== null) {
    for (const [lengthOp, lengthVal] of Object.entries(v)) {
      const value = lengthVal as ScalarValue
      switch (lengthOp) {
        case "eq":
          checks.push({ op: OP.LENGTH, val: value })
          break
        case "gt":
          checks.push({ op: OP.GT, val: value })
          break
        case "lt":
          checks.push({ op: OP.LT, val: value })
          break
        case "gte":
          checks.push({ op: OP.GTE, val: value })
          break
        case "lte":
          checks.push({ op: OP.LTE, val: value })
          break
      }
    }
  }

  return checks
}
