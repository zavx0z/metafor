import type { MatrixConditionRecord, MatrixScalarValue, MatrixStore, MatrixValue } from "../../store.t"
import { OP, FIELD_TYPE, STATE_NONE, STATE_UNDEFINED } from "../constants"

function scalarEquals(left: MatrixScalarValue, right: MatrixScalarValue): boolean {
  return left === right
}

function arrayIncludes(values: MatrixScalarValue[], target: MatrixScalarValue): boolean {
  return values.some((value) => scalarEquals(value, target))
}

function evaluateScalarCondition(value: MatrixScalarValue, condition: MatrixConditionRecord): boolean {
  if (Array.isArray(condition.value) && (condition.op === OP.IN || condition.op === OP.NOT_IN)) {
    const found = condition.value.some((item) => scalarEquals(value, item))
    return condition.op === OP.IN ? found : !found
  }

  const expected = condition.value as MatrixScalarValue
  switch (condition.op) {
    case OP.EQ:
      return scalarEquals(value, expected)
    case OP.NEQ:
      return !scalarEquals(value, expected)
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

function evaluateArrayCondition(value: MatrixValue | undefined, condition: MatrixConditionRecord): boolean {
  const items = Array.isArray(value) ? value : []

  switch (condition.op) {
    case OP.INCLUDE:
      return arrayIncludes(items, condition.value as MatrixScalarValue)
    case OP.NOT_INCLUDE:
      return !arrayIncludes(items, condition.value as MatrixScalarValue)
    case OP.LENGTH:
      return items.length === Number(condition.value)
    case OP.IS_EMPTY:
      return (items.length === 0) === Boolean(condition.value)
    case OP.EQ:
    case OP.NEQ:
    case OP.GT:
    case OP.LT:
    case OP.GTE:
    case OP.LTE:
      return evaluateScalarCondition(items.length, condition)
    default:
      return false
  }
}

function evaluateCondition(store$: MatrixStore, braneIndex: number, condition: MatrixConditionRecord): boolean {
  const field = store$.fields[condition.fieldIndex]
  const value = store$.getFieldValue(braneIndex, condition.fieldIndex)

  if (field?.type === FIELD_TYPE.ARRAY_PTR) {
    return evaluateArrayCondition(value, condition)
  }

  return evaluateScalarCondition((value ?? 0) as MatrixScalarValue, condition)
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
    if (!transition) {
      continue
    }

    let passed = true
    const conditionEnd = transition.conditionOffset + transition.conditionCount
    for (let conditionIndex = transition.conditionOffset; conditionIndex < conditionEnd; conditionIndex++) {
      const condition = store$.conditions[conditionIndex]
      if (!condition || !evaluateCondition(store$, braneIndex, condition)) {
        passed = false
        break
      }
    }

    if (passed) {
      return transition.targetState
    }
  }

  return currentState
}
