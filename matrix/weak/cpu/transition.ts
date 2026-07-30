/**
 * Каноническое вычисление Conditions на CPU.
 *
 * Значения в Store уже приведены к F32/U32/BOOL и к идентификаторам строк.
 * Поэтому эта функция задаёт тот же закон, который повторяет WebGPU. Отсутствие
 * значения представлено только `null`; ноль, `false`, пустая строка, первый
 * элемент перечисления и пустой массив остаются обычными значениями.
 *
 * @packageDocumentation
 */

import type {
  MatrixConditionRecord,
  MatrixParsedCheck,
  MatrixQuantifierValue,
  MatrixRegExpValue,
} from "@metafor/types/matrix/condition"
import type { MatrixScalarValue, MatrixStore, MatrixValue } from "@metafor/types/matrix/store"
import { OP, FIELD_TYPE, STATE_NONE, STATE_UNDEFINED } from "../constants"

const scalarEquals = (left: MatrixScalarValue, right: MatrixScalarValue): boolean =>
  left === right

const arrayIncludes = (values: MatrixScalarValue[], target: MatrixScalarValue): boolean =>
  values.some((value) => scalarEquals(value, target))

function evaluateScalar(value: MatrixScalarValue, op: number, expected: unknown): boolean {
  if (Array.isArray(expected) && (op === OP.IN || op === OP.NOT_IN)) {
    const found = expected.some((item) => scalarEquals(value, item as MatrixScalarValue))
    return op === OP.IN ? found : !found
  }

  switch (op) {
    case OP.EQ:
      return scalarEquals(value, expected as MatrixScalarValue)
    case OP.NEQ:
      return !scalarEquals(value, expected as MatrixScalarValue)
    case OP.GT:
      return Number(value) > Number(expected)
    case OP.LT:
      return Number(value) < Number(expected)
    case OP.GTE:
      return Number(value) >= Number(expected)
    case OP.LTE:
      return Number(value) <= Number(expected)
    default:
      return false
  }
}

function evaluateLength(length: number, op: number, expected: unknown): boolean {
  switch (op) {
    case OP.LENGTH:
      return length === Number(expected)
    case OP.LENGTH_GT:
      return length > Number(expected)
    case OP.LENGTH_GTE:
      return length >= Number(expected)
    case OP.LENGTH_LT:
      return length < Number(expected)
    case OP.LENGTH_LTE:
      return length <= Number(expected)
    default:
      return false
  }
}

function evaluateArrayItem(value: MatrixScalarValue, checks: MatrixParsedCheck[]): boolean {
  return checks.every((check) => evaluateScalar(value, check.op, check.val))
}

function evaluateArray(value: MatrixScalarValue[], condition: MatrixConditionRecord): boolean {
  if (evaluateLength(value.length, condition.op, condition.value)) return true

  switch (condition.op) {
    case OP.INCLUDE:
      return arrayIncludes(value, condition.value as MatrixScalarValue)
    case OP.NOT_INCLUDE:
      return !arrayIncludes(value, condition.value as MatrixScalarValue)
    case OP.IS_EMPTY:
      return (value.length === 0) === Boolean(condition.value)
    case OP.ARRAY_EQ: {
      const expected = condition.value as MatrixScalarValue[]
      return value.length === expected.length &&
        value.every((item, index) => scalarEquals(item, expected[index]!))
    }
    case OP.EVERY:
      return value.every((item) =>
        evaluateArrayItem(item, (condition.value as MatrixQuantifierValue).checks))
    case OP.SOME:
      return value.some((item) =>
        evaluateArrayItem(item, (condition.value as MatrixQuantifierValue).checks))
    default:
      return false
  }
}

function storedString(store$: MatrixStore, value: MatrixValue): string {
  return store$.stringTable[Number(value)] ?? ""
}

function evaluateString(
  store$: MatrixStore,
  storedValue: MatrixScalarValue,
  condition: MatrixConditionRecord,
): boolean {
  const value = storedString(store$, storedValue)
  const expectedString = (): string => storedString(store$, condition.value as MatrixScalarValue)

  if (evaluateLength(value.length, condition.op, condition.value)) return true

  switch (condition.op) {
    case OP.EQ:
    case OP.NEQ:
    case OP.IN:
    case OP.NOT_IN:
      return evaluateScalar(storedValue, condition.op, condition.value)
    case OP.STARTS_WITH:
      return value.startsWith(expectedString())
    case OP.ENDS_WITH:
      return value.endsWith(expectedString())
    case OP.CONTAINS:
      return value.includes(expectedString())
    case OP.NOT_CONTAINS:
      return !value.includes(expectedString())
    case OP.NOT_STARTS_WITH:
      return !value.startsWith(expectedString())
    case OP.NOT_ENDS_WITH:
      return !value.endsWith(expectedString())
    case OP.STRING_BETWEEN: {
      const [lower, upper] = condition.value as MatrixScalarValue[]
      return value >= storedString(store$, lower!) && value <= storedString(store$, upper!)
    }
    case OP.PATTERN: {
      const pattern = condition.value as MatrixRegExpValue
      return new RegExp(pattern.source, pattern.flags).test(value)
    }
    default:
      return false
  }
}

/**
 * Вычисляет одну каноническую проверку для конкретной браны.
 *
 * Эта функция также используется при подготовке производной WebGPU-инструкции
 * для регулярного выражения, которое WGSL не умеет исполнять напрямую.
 */
export function evaluateCondition(
  store$: MatrixStore,
  braneIndex: number,
  condition: MatrixConditionRecord,
): boolean {
  if (condition.op === OP.RESOLVED) return Boolean(condition.value)

  const value = store$.getFieldValue(braneIndex, condition.fieldIndex)
  if (condition.op === OP.IS_NULL) return value === null
  if (condition.op === OP.IS_NOT_NULL) return value !== null
  if (value === null || value === undefined) return false

  const field = store$.fields[condition.fieldIndex]
  if (field?.type === FIELD_TYPE.ARRAY_PTR) {
    return Array.isArray(value) && evaluateArray(value, condition)
  }
  if (field?.type === FIELD_TYPE.STRING_PTR) {
    return evaluateString(store$, value as MatrixScalarValue, condition)
  }
  return evaluateScalar(value as MatrixScalarValue, condition.op, condition.value)
}

export function evaluateBraneNextState(store$: MatrixStore, braneIndex: number): number {
  const brane = store$.branes[braneIndex]
  if (!brane) {
    return store$.states[braneIndex] ?? STATE_NONE
  }

  const currentState = store$.states[braneIndex] ?? STATE_NONE
  if (currentState === STATE_NONE || currentState === STATE_UNDEFINED) {
    return currentState
  }

  const stateRecord = store$.getState(braneIndex, currentState)
  if (!stateRecord) {
    return currentState
  }

  const transitionEnd = stateRecord.transitionOffset + stateRecord.transitionCount
  for (let transitionIndex = stateRecord.transitionOffset; transitionIndex < transitionEnd; transitionIndex++) {
    const transition = store$.transitions[transitionIndex]
    if (!transition) continue

    let passed = true
    const conditionEnd = transition.conditionOffset + transition.conditionCount
    for (let conditionIndex = transition.conditionOffset; conditionIndex < conditionEnd; conditionIndex++) {
      const condition = store$.conditions[conditionIndex]
      if (!condition || !evaluateCondition(store$, braneIndex, condition)) {
        passed = false
        break
      }
    }

    if (passed) return transition.targetState
  }

  return currentState
}
