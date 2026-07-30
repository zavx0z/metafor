/**
 * Разбор единого языка Conditions в канонические проверки Matrix.
 *
 * Здесь сводятся краткие записи, публичные имена операторов и их допустимость
 * для конкретного Field. Неизвестная или несовместимая операция всегда
 * завершает подготовку ошибкой и никогда не исчезает из Transition.
 *
 * @packageDocumentation
 */

import { OP } from "../weak"
import { FieldType } from "./schema"
import type {
  MatrixConditionOperand,
  MatrixConditionOperators,
  MatrixConditionScalarValue,
  MatrixConditionValue,
  MatrixParsedCheck,
  MatrixRegExpValue,
} from "@metafor/types/matrix/condition"
import type { MatrixFieldRecord } from "@metafor/types/matrix/data"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isRegExpDescriptor = (value: unknown): value is MatrixRegExpValue =>
  isRecord(value) &&
  Object.keys(value).length === 2 &&
  typeof value.source === "string" &&
  typeof value.flags === "string"

const regexpDescriptor = (value: RegExp | MatrixRegExpValue): MatrixRegExpValue =>
  value instanceof RegExp
    ? { source: value.source, flags: value.flags }
    : { source: value.source, flags: value.flags }

const scalar = (value: unknown, operator: string): MatrixConditionScalarValue => {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value
  }
  throw new Error(`Matrix condition '${operator}' requires a scalar operand`)
}

const scalarList = (value: unknown, operator: string): MatrixConditionScalarValue[] => {
  if (!Array.isArray(value)) throw new Error(`Matrix condition '${operator}' requires an array operand`)
  return value.map((item) => scalar(item, operator))
}

const numberOperand = (value: unknown, operator: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Matrix condition '${operator}' requires a finite number`)
  }
  return value
}

const booleanOperand = (value: unknown, operator: string): boolean => {
  if (typeof value !== "boolean") throw new Error(`Matrix condition '${operator}' requires a boolean`)
  return value
}

const stringOperand = (value: unknown, operator: string): string => {
  if (typeof value !== "string") throw new Error(`Matrix condition '${operator}' requires a string`)
  return value
}

function assertFieldSupports(field: MatrixFieldRecord | undefined, operator: string): void {
  if (!field) return

  const enumField = field.enum !== undefined
  const numeric = (field.type === FieldType.F32 || field.type === FieldType.U32) && !enumField
  const string = field.type === FieldType.STRING_PTR
  const array = field.type === FieldType.ARRAY_PTR
  const boolean = field.type === FieldType.BOOL

  const allowed =
    operator === "null" ||
    operator === "eq" ||
    operator === "notEq" ||
    ((operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte" ||
      operator === "notGt" || operator === "notGte" || operator === "notLt" || operator === "notLte") && numeric) ||
    ((operator === "in" || operator === "notIn") && (numeric || string || enumField)) ||
    ((operator === "oneOf" || operator === "notOneOf") && enumField) ||
    (operator === "logicalEq" && boolean) ||
    ((operator === "startsWith" || operator === "endsWith" ||
      operator === "notStartsWith" || operator === "notEndsWith" ||
      operator === "pattern") && string) ||
    ((operator === "include" || operator === "notInclude") && (string || array)) ||
    ((operator === "includes" || operator === "notIncludes" || operator === "isEmpty" ||
      operator === "every" || operator === "some") &&
      array &&
      ((operator !== "every" && operator !== "some") || (field.elementType ?? "number") === "number")) ||
    (operator === "length" && (string || array)) ||
    (operator === "between" && (numeric || string))

  if (!allowed) {
    throw new Error(`Matrix condition '${operator}' is not valid for Field type ${field.type}`)
  }
}

/**
 * Преобразует одно условие Field в последовательность проверок, соединённых
 * через «и».
 *
 * @param condition Условие из MetaJSON/Boundary либо прямой вход Matrix.
 * @param field Объявление Field; если передано, несовместимые операции
 * отклоняются до сборки Store.
 * @returns Канонические проверки в порядке объявления операций.
 * @throws При неизвестной операции, неверном операнде или несовместимом Field.
 *
 * @see [Полный путь условий MetaJSON → Boundary → Matrix](https://github.com/zavx0z/metafor/blob/main/matrix/conditions.integration.spec.ts)
 * @see [Одинаковое выполнение CPU и WebGPU](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.conditions.test.ts)
 */
export function parseCondition(
  condition: MatrixConditionValue,
  field?: MatrixFieldRecord,
): MatrixParsedCheck[] {
  if (condition === null) return [{ op: OP.IS_NULL, val: 0 }]
  if (condition instanceof RegExp || isRegExpDescriptor(condition)) {
    assertFieldSupports(field, "pattern")
    return [{ op: OP.PATTERN, val: regexpDescriptor(condition) }]
  }
  if (Array.isArray(condition)) {
    if (field && field.type !== FieldType.ARRAY_PTR) {
      throw new Error(`Matrix array equality condition is not valid for Field type ${field.type}`)
    }
    return [{ op: OP.ARRAY_EQ, val: scalarList(condition, "array equality") }]
  }
  if (!isRecord(condition)) return [{ op: OP.EQ, val: scalar(condition, "eq") }]

  const checks: MatrixParsedCheck[] = []
  for (const [operator, operand] of Object.entries(condition as MatrixConditionOperators)) {
    const canonicalOperator =
      operator === "ne" || operator === "neq" ? "notEq" : operator
    assertFieldSupports(field, canonicalOperator)

    switch (canonicalOperator) {
      case "null":
        checks.push({
          op: booleanOperand(operand, operator) ? OP.IS_NULL : OP.IS_NOT_NULL,
          val: 0,
        })
        break
      case "eq":
        if (field?.type === FieldType.ARRAY_PTR && Array.isArray(operand)) {
          checks.push({op: OP.ARRAY_EQ, val: scalarList(operand, operator)})
        } else {
          checks.push({ op: OP.EQ, val: scalar(operand, operator) })
        }
        break
      case "logicalEq":
        checks.push({ op: OP.EQ, val: booleanOperand(operand, operator) })
        break
      case "notEq":
        checks.push({ op: OP.NEQ, val: scalar(operand, operator) })
        break
      case "gt":
        checks.push({ op: OP.GT, val: scalar(operand, operator) })
        break
      case "lt":
        checks.push({ op: OP.LT, val: scalar(operand, operator) })
        break
      case "gte":
        checks.push({ op: OP.GTE, val: scalar(operand, operator) })
        break
      case "lte":
        checks.push({ op: OP.LTE, val: scalar(operand, operator) })
        break
      case "notGt":
        checks.push({ op: OP.LTE, val: scalar(operand, operator) })
        break
      case "notGte":
        checks.push({ op: OP.LT, val: scalar(operand, operator) })
        break
      case "notLt":
        checks.push({ op: OP.GTE, val: scalar(operand, operator) })
        break
      case "notLte":
        checks.push({ op: OP.GT, val: scalar(operand, operator) })
        break
      case "in":
      case "oneOf":
        checks.push({ op: OP.IN, val: scalarList(operand, operator) })
        break
      case "notIn":
      case "notOneOf":
        checks.push({ op: OP.NOT_IN, val: scalarList(operand, operator) })
        break
      case "include":
        checks.push({
          op: field?.type === FieldType.STRING_PTR ? OP.CONTAINS : OP.INCLUDE,
          val: scalar(operand, operator),
        })
        break
      case "notInclude":
        checks.push({
          op: field?.type === FieldType.STRING_PTR ? OP.NOT_CONTAINS : OP.NOT_INCLUDE,
          val: scalar(operand, operator),
        })
        break
      case "includes":
        checks.push({ op: OP.INCLUDE, val: scalar(operand, operator) })
        break
      case "notIncludes":
        checks.push({ op: OP.NOT_INCLUDE, val: scalar(operand, operator) })
        break
      case "startsWith":
        checks.push({ op: OP.STARTS_WITH, val: stringOperand(operand, operator) })
        break
      case "endsWith":
        checks.push({ op: OP.ENDS_WITH, val: stringOperand(operand, operator) })
        break
      case "notStartsWith":
        checks.push({ op: OP.NOT_STARTS_WITH, val: stringOperand(operand, operator) })
        break
      case "notEndsWith":
        checks.push({ op: OP.NOT_ENDS_WITH, val: stringOperand(operand, operator) })
        break
      case "pattern": {
        if (!(operand instanceof RegExp) && !isRegExpDescriptor(operand)) {
          throw new Error("Matrix condition 'pattern' requires a RegExp descriptor")
        }
        const pattern = regexpDescriptor(operand)
        new RegExp(pattern.source, pattern.flags)
        checks.push({ op: OP.PATTERN, val: pattern })
        break
      }
      case "length":
        checks.push(...parseLengthCondition(operand))
        break
      case "isEmpty":
        checks.push({ op: OP.IS_EMPTY, val: booleanOperand(operand, operator) })
        break
      case "every":
      case "some":
        checks.push({
          op: canonicalOperator === "every" ? OP.EVERY : OP.SOME,
          val: { checks: parseArrayItemCondition(operand, canonicalOperator) },
        })
        break
      case "between": {
        const range = scalarList(operand, operator)
        if (range.length !== 2) throw new Error("Matrix condition 'between' requires exactly two bounds")
        if (range.every((item) => typeof item === "string")) {
          checks.push({ op: OP.STRING_BETWEEN, val: range })
        } else if (range.every((item) => typeof item === "number")) {
          checks.push({ op: OP.GTE, val: range[0]! })
          checks.push({ op: OP.LTE, val: range[1]! })
        } else {
          throw new Error("Matrix condition 'between' bounds must have one scalar type")
        }
        break
      }
      default:
        throw new Error(`Unknown Matrix condition operator '${operator}'`)
    }
  }
  if (checks.length === 0) {
    throw new Error("Matrix condition requires at least one operator")
  }
  return checks
}

function parseLengthCondition(value: unknown): MatrixParsedCheck[] {
  if (typeof value === "number") {
    return [{ op: OP.LENGTH, val: numberOperand(value, "length") }]
  }
  if (!isRecord(value)) throw new Error("Matrix condition 'length' requires a number or range")

  const checks: MatrixParsedCheck[] = []
  for (const [operator, operand] of Object.entries(value)) {
    const length = numberOperand(operand, `length.${operator}`)
    switch (operator) {
      case "eq":
        checks.push({ op: OP.LENGTH, val: length })
        break
      case "min":
      case "gte":
        checks.push({ op: OP.LENGTH_GTE, val: length })
        break
      case "max":
      case "lte":
        checks.push({ op: OP.LENGTH_LTE, val: length })
        break
      case "gt":
        checks.push({ op: OP.LENGTH_GT, val: length })
        break
      case "lt":
        checks.push({ op: OP.LENGTH_LT, val: length })
        break
      default:
        throw new Error(`Unknown Matrix length operator '${operator}'`)
    }
  }
  if (checks.length === 0) {
    throw new Error("Matrix condition 'length' requires at least one operator")
  }
  return checks
}

function parseArrayItemCondition(value: unknown, quantifier: string): MatrixParsedCheck[] {
  if (!isRecord(value)) throw new Error(`Matrix condition '${quantifier}' requires an item condition`)
  const checks: MatrixParsedCheck[] = []
  for (const [operator, operand] of Object.entries(value)) {
    const item = numberOperand(operand, `${quantifier}.${operator}`)
    switch (operator) {
      case "eq":
        checks.push({ op: OP.EQ, val: item })
        break
      case "gt":
        checks.push({ op: OP.GT, val: item })
        break
      case "gte":
        checks.push({ op: OP.GTE, val: item })
        break
      case "lt":
        checks.push({ op: OP.LT, val: item })
        break
      case "lte":
        checks.push({ op: OP.LTE, val: item })
        break
      default:
        throw new Error(`Unknown Matrix array item operator '${operator}'`)
    }
  }
  if (checks.length === 0) {
    throw new Error(`Matrix condition '${quantifier}' requires at least one item operator`)
  }
  return checks
}
