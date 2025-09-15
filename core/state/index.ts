/**
 * Реализация состояний и переходов
 * @module States
 */

import type { Schema, Values } from "@zavx0z/context"
import type { Condition, Conditions, StatesConfig, Transitions } from "./index.t"
export type { Condition, StatesConfig }

// Экспортируем валидатор
export { validateNoUnconditionalCycles } from "./validator.ts"

/**
 * Проверяет условия переходов между состояниями
 * @param conditions - условия перехода
 * @param context - текущий контекст
 * @returns true если все условия выполнены
 *
 * @example
 * ```typescript
 * // Простые условия
 * checkTransitionConditions({ name: "John" }, { name: "John" })
 * // => true
 *
 * // Сложные условия
 * checkTransitionConditions(
 *   { age: { gte: 18, lte: 65 } },
 *   { age: 25 }
 * )
 * // => true
 *
 * // Условия с регулярными выражениями
 * checkTransitionConditions(
 *   { email: { pattern: /@/ } },
 *   { email: "test@example.com" }
 * )
 * // => true
 * ```
 */
export const checkTransition = <C extends Schema>(conditions: Conditions<C>, context: Values<C>): boolean => {
  for (const [field, condition] of Object.entries(conditions)) {
    const value = context[field]
    if (!evaluateCondition(condition, value)) return false
  }
  return true
}

/**
 * Оценивает одно условие
 */
const evaluateCondition = (condition: any, value: any): boolean => {
  // Простые значения
  if (typeof condition === "string" || typeof condition === "number" || typeof condition === "boolean") {
    return value === condition
  }

  // null
  if (condition === null) {
    return value === null
  }

  // RegExp
  if (condition instanceof RegExp) {
    return typeof value === "string" && condition.test(value)
  }

  // Объект с условиями
  if (typeof condition === "object" && condition !== null) {
    return evaluateComplexCondition(condition, value)
  }

  return false
}

/**
 * Оценивает сложное условие с объектом параметров
 */
const evaluateComplexCondition = (condition: any, value: any): boolean => {
  // Проверка на null
  if ("null" in condition) {
    if (condition.null !== (value === null)) {
      return false
    }
  }

  // Строковые условия
  if (typeof value === "string") {
    if ("eq" in condition && value !== condition.eq) {
      return false
    }
    if ("startsWith" in condition && !value.startsWith(condition.startsWith)) {
      return false
    }
    if ("endsWith" in condition && !value.endsWith(condition.endsWith)) {
      return false
    }
    if ("include" in condition && !value.includes(condition.include)) {
      return false
    }
    if ("notInclude" in condition && value.includes(condition.notInclude)) {
      return false
    }
    if ("pattern" in condition && !condition.pattern.test(value)) {
      return false
    }
    if ("length" in condition) {
      const length = condition.length
      if (typeof length === "number" && value.length !== length) {
        return false
      }
      if (typeof length === "object") {
        if (length.min !== undefined && value.length < length.min) {
          return false
        }
        if (length.max !== undefined && value.length > length.max) {
          return false
        }
      }
    }
  }

  // Числовые условия
  if (typeof value === "number") {
    if ("eq" in condition && value !== condition.eq) {
      return false
    }
    if ("gt" in condition && value <= condition.gt) {
      return false
    }
    if ("gte" in condition && value < condition.gte) {
      return false
    }
    if ("lt" in condition && value >= condition.lt) {
      return false
    }
    if ("lte" in condition && value > condition.lte) {
      return false
    }
    if ("between" in condition) {
      const [min, max] = condition.between
      if (value < min || value > max) {
        return false
      }
    }
  }

  // Булевы условия
  if (typeof value === "boolean") {
    if ("eq" in condition && value !== condition.eq) {
      return false
    }
    if ("logicalEq" in condition && !!value !== condition.logicalEq) {
      return false
    }
  }

  // Массивы
  if (Array.isArray(value)) {
    if ("length" in condition) {
      const length = condition.length
      if (typeof length === "number" && value.length !== length) {
        return false
      }
      if (typeof length === "object") {
        if (length.min !== undefined && value.length < length.min) {
          return false
        }
        if (length.max !== undefined && value.length > length.max) {
          return false
        }
      }
    }
    if ("includes" in condition && !value.includes(condition.includes)) {
      return false
    }
    if ("notIncludes" in condition && value.includes(condition.notIncludes)) {
      return false
    }
    if ("isEmpty" in condition && (value.length === 0) !== condition.isEmpty) {
      return false
    }
    if ("every" in condition) {
      const everyCondition = condition.every
      if (!value.every((item: any) => evaluateArrayItemCondition(everyCondition, item))) {
        return false
      }
    }
    if ("some" in condition) {
      const someCondition = condition.some
      if (!value.some((item: any) => evaluateArrayItemCondition(someCondition, item))) {
        return false
      }
    }
  }

  return true
}

/**
 * Оценивает условие для элемента массива
 */
const evaluateArrayItemCondition = (condition: any, item: any): boolean => {
  // Числовые элементы
  if (typeof item === "number") {
    if ("gt" in condition && item <= condition.gt) {
      return false
    }
    if ("gte" in condition && item < condition.gte) {
      return false
    }
    if ("lt" in condition && item >= condition.lt) {
      return false
    }
    if ("lte" in condition && item > condition.lte) {
      return false
    }
    if ("eq" in condition && item !== condition.eq) {
      return false
    }
  }

  // Строковые элементы
  if (typeof item === "string") {
    if ("include" in condition && !item.includes(condition.include)) {
      return false
    }
    if ("startsWith" in condition && !item.startsWith(condition.startsWith)) {
      return false
    }
    if ("endsWith" in condition && !item.endsWith(condition.endsWith)) {
      return false
    }
    if ("pattern" in condition && !condition.pattern.test(item)) {
      return false
    }
  }

  return true
}
