import { OP, FieldType } from "@boundary/fields"
import type { BoundaryConditionRecord, BoundaryData, BoundaryScalarValue, BoundaryValue } from "../../store.t"

function readBraneFieldValue(store: BoundaryData, braneIndex: number, fieldIndex: number): BoundaryValue {
  const brane = store.branes[braneIndex]
  if (!brane) {
    return 0
  }

  const localField = brane.localFields.find((field) => field.fieldIndex === fieldIndex)
  if (localField) {
    return localField.value
  }

  for (const sharedBlockId of brane.sharedBlockIds) {
    const sharedBlock = store.sharedBlocks[sharedBlockId]
    const sharedField = sharedBlock?.fields.find((field) => field.fieldIndex === fieldIndex)
    if (sharedField) {
      return sharedField.value
    }
  }

  return 0
}

function scalarEquals(left: BoundaryScalarValue, right: BoundaryScalarValue): boolean {
  return left === right
}

function arrayIncludes(values: BoundaryScalarValue[], target: BoundaryScalarValue): boolean {
  return values.some((value) => scalarEquals(value, target))
}

function evaluateScalarCondition(value: BoundaryScalarValue, condition: BoundaryConditionRecord): boolean {
  if (Array.isArray(condition.value) && (condition.op === OP.IN || condition.op === OP.NOT_IN)) {
    const found = condition.value.some((item) => scalarEquals(value, item))
    return condition.op === OP.IN ? found : !found
  }

  const expected = condition.value as BoundaryScalarValue
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

function evaluateArrayCondition(value: BoundaryValue, condition: BoundaryConditionRecord): boolean {
  const items = Array.isArray(value) ? value : []

  switch (condition.op) {
    case OP.INCLUDE:
      return arrayIncludes(items, condition.value as BoundaryScalarValue)
    case OP.NOT_INCLUDE:
      return !arrayIncludes(items, condition.value as BoundaryScalarValue)
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

function evaluateCondition(store: BoundaryData, braneIndex: number, condition: BoundaryConditionRecord): boolean {
  const field = store.fields[condition.fieldIndex]
  const value = readBraneFieldValue(store, braneIndex, condition.fieldIndex)

  if (field?.type === FieldType.ARRAY_PTR) {
    return evaluateArrayCondition(value, condition)
  }

  return evaluateScalarCondition(value as BoundaryScalarValue, condition)
}

export function evaluateBraneNextState(store: BoundaryData, braneIndex: number): number {
  const brane = store.branes[braneIndex]
  if (!brane) {
    return store.states[braneIndex] ?? 0
  }

  const currentState = store.states[braneIndex] ?? 0
  const stateTransitions = brane.transitions[currentState] ?? []

  for (const transition of stateTransitions) {
    if (transition.targetState === null) {
      continue
    }

    const passed = transition.conditions.every((condition) => evaluateCondition(store, braneIndex, condition))
    if (passed) {
      return transition.targetState
    }
  }

  return currentState
}
