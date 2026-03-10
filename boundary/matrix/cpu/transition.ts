import { getBraneStateRecord, readBraneFieldValue } from "../../store.access"
import type { BoundaryConditionRecord, BoundaryData, BoundaryScalarValue, BoundaryValue } from "../../store.t"
import { CONDITION_OP, FIELD_TYPE } from "../constants"

function scalarEquals(left: BoundaryScalarValue, right: BoundaryScalarValue): boolean {
  return left === right
}

function arrayIncludes(values: BoundaryScalarValue[], target: BoundaryScalarValue): boolean {
  return values.some((value) => scalarEquals(value, target))
}

function evaluateScalarCondition(value: BoundaryScalarValue, condition: BoundaryConditionRecord): boolean {
  if (Array.isArray(condition.value) && (condition.op === CONDITION_OP.IN || condition.op === CONDITION_OP.NOT_IN)) {
    const found = condition.value.some((item) => scalarEquals(value, item))
    return condition.op === CONDITION_OP.IN ? found : !found
  }

  const expected = condition.value as BoundaryScalarValue
  switch (condition.op) {
    case CONDITION_OP.EQ:
      return scalarEquals(value, expected)
    case CONDITION_OP.NEQ:
      return !scalarEquals(value, expected)
    case CONDITION_OP.GT:
      return Number(value) > Number(expected)
    case CONDITION_OP.LT:
      return Number(value) < Number(expected)
    case CONDITION_OP.GTE:
      return Number(value) >= Number(expected)
    case CONDITION_OP.LTE:
      return Number(value) <= Number(expected)
    default:
      return false
  }
}

function evaluateArrayCondition(value: BoundaryValue | undefined, condition: BoundaryConditionRecord): boolean {
  const items = Array.isArray(value) ? value : []

  switch (condition.op) {
    case CONDITION_OP.INCLUDE:
      return arrayIncludes(items, condition.value as BoundaryScalarValue)
    case CONDITION_OP.NOT_INCLUDE:
      return !arrayIncludes(items, condition.value as BoundaryScalarValue)
    case CONDITION_OP.LENGTH:
      return items.length === Number(condition.value)
    case CONDITION_OP.IS_EMPTY:
      return (items.length === 0) === Boolean(condition.value)
    case CONDITION_OP.EQ:
    case CONDITION_OP.NEQ:
    case CONDITION_OP.GT:
    case CONDITION_OP.LT:
    case CONDITION_OP.GTE:
    case CONDITION_OP.LTE:
      return evaluateScalarCondition(items.length, condition)
    default:
      return false
  }
}

function evaluateCondition(store: BoundaryData, braneIndex: number, condition: BoundaryConditionRecord): boolean {
  const field = store.fields[condition.fieldIndex]
  const value = readBraneFieldValue(store, braneIndex, condition.fieldIndex)

  if (field?.type === FIELD_TYPE.ARRAY_PTR) {
    return evaluateArrayCondition(value, condition)
  }

  return evaluateScalarCondition((value ?? 0) as BoundaryScalarValue, condition)
}

export function evaluateBraneNextState(store: BoundaryData, braneIndex: number): number {
  const brane = store.branes[braneIndex]
  if (!brane) {
    return store.states[braneIndex] ?? 0
  }

  const currentState = store.states[braneIndex] ?? 0
  const stateRecord = getBraneStateRecord(store, braneIndex, currentState)
  if (!stateRecord) {
    return currentState
  }

  const transitionEnd = stateRecord.transitionOffset + stateRecord.transitionCount
  for (let transitionIndex = stateRecord.transitionOffset; transitionIndex < transitionEnd; transitionIndex++) {
    const transition = store.transitions[transitionIndex]
    if (!transition) {
      continue
    }

    let passed = true
    const conditionEnd = transition.conditionOffset + transition.conditionCount
    for (let conditionIndex = transition.conditionOffset; conditionIndex < conditionEnd; conditionIndex++) {
      const condition = store.conditions[conditionIndex]
      if (!condition || !evaluateCondition(store, braneIndex, condition)) {
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
