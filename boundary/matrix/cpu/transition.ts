import { findFieldOffset, OP, TYPE, uintToFloat } from "@boundary/fields"

/**
 * Читает сырое значение поля из heap (локального или entangled блока).
 *
 * @see gpu/evolution.wgsl:get_field_value_raw() — WGSL-эквивалент
 */
function readFieldValueRaw(heap: Uint32Array, blockPtr: number, fieldIndex: number): number {
  const localOffset = findFieldOffset(heap, blockPtr, fieldIndex)
  if (localOffset !== null) {
    return heap[localOffset] ?? 0
  }

  const localCount = heap[blockPtr] ?? 0
  const entangledCount = heap[blockPtr + 1] ?? 0
  const entangledPtrsOffset = blockPtr + 3 + localCount * 2

  for (let index = 0; index < entangledCount; index++) {
    const entangledPtr = heap[entangledPtrsOffset + index] ?? 0
    if (entangledPtr === 0) {
      continue
    }
    const entangledOffset = findFieldOffset(heap, entangledPtr, fieldIndex)
    if (entangledOffset !== null) {
      return heap[entangledOffset] ?? 0
    }
  }

  return 0
}

function readBytecodeWord(bytecode: Uint32Array, offset: number): number {
  return bytecode[offset] ?? 0
}

/**
 * Проверяет условие перехода (EQ/NEQ/GT/LT/GTE/LTE/IN/NOT_IN/INCLUDE/NOT_INCLUDE/LENGTH/IS_EMPTY).
 *
 * @see gpu/evolution.wgsl:check_cond() — WGSL-эквивалент
 */
function evaluateCondition(
  heap: Uint32Array,
  bytecode: Uint32Array,
  op: number,
  fieldType: number,
  valueRaw: number,
  encodedRaw: number,
  condValuesBase: number,
): boolean {
  if (fieldType === TYPE.ARRAY) {
    const pointer = valueRaw
    const length = pointer === 0 ? 0 : (heap[pointer] ?? 0)

    if (op === OP.LENGTH || op === OP.EQ) return length === encodedRaw
    if (op === OP.NEQ) return length !== encodedRaw
    if (op === OP.GT) return length > encodedRaw
    if (op === OP.LT) return length < encodedRaw
    if (op === OP.GTE) return length >= encodedRaw
    if (op === OP.LTE) return length <= encodedRaw
    if (op === OP.IS_EMPTY) return (length === 0) === (encodedRaw === 1)

    if (op === OP.INCLUDE || op === OP.NOT_INCLUDE) {
      let found = false
      for (let index = 0; index < length; index++) {
        if ((heap[pointer + 1 + index] ?? 0) === encodedRaw) {
          found = true
          break
        }
      }
      return op === OP.INCLUDE ? found : !found
    }
    return false
  }

  if (op === OP.IN || op === OP.NOT_IN) {
    const listPtr = condValuesBase + encodedRaw
    const count = readBytecodeWord(bytecode, listPtr)
    let found = false

    for (let index = 0; index < count; index++) {
      const itemRaw = readBytecodeWord(bytecode, listPtr + 1 + index)
      const equal = fieldType === TYPE.FLOAT
        ? uintToFloat(valueRaw) === uintToFloat(itemRaw)
        : valueRaw === itemRaw
      if (equal) {
        found = true
        break
      }
    }

    return op === OP.IN ? found : !found
  }

  const left = fieldType === TYPE.FLOAT ? uintToFloat(valueRaw) : valueRaw
  const right = fieldType === TYPE.FLOAT ? uintToFloat(encodedRaw) : encodedRaw

  if (op === OP.EQ) return left === right
  if (op === OP.NEQ) return left !== right
  if (op === OP.GT) return left > right
  if (op === OP.LT) return left < right
  if (op === OP.GTE) return left >= right
  if (op === OP.LTE) return left <= right

  return false
}

/**
 * Вычисляет следующее состояние браны на основе bytecode.
 *
 * @see gpu/evolution.wgsl:main() (строки 515-560) — WGSL-эквивалент логики переходов
 */
export function evaluateBraneNextState(
  heap: Uint32Array,
  bytecode: Uint32Array,
  bytecodeBase: number,
  blockPtr: number,
  currentState: number,
): number {
  const statePtr = readBytecodeWord(bytecode, bytecodeBase + currentState)
  const transitionCount = readBytecodeWord(bytecode, bytecodeBase + statePtr)

  for (let transitionIndex = 0; transitionIndex < transitionCount; transitionIndex++) {
    const transitionBase = bytecodeBase + statePtr + 1 + transitionIndex * 2
    const targetState = readBytecodeWord(bytecode, transitionBase)
    const condPtr = readBytecodeWord(bytecode, transitionBase + 1)
    const condCount = readBytecodeWord(bytecode, bytecodeBase + condPtr)
    const condValuesBase = bytecodeBase + condPtr + 1

    let passed = true
    for (let conditionIndex = 0; conditionIndex < condCount; conditionIndex++) {
      const conditionBase = condValuesBase + conditionIndex * 4
      const fieldType = readBytecodeWord(bytecode, conditionBase)
      const fieldIndex = readBytecodeWord(bytecode, conditionBase + 1)
      const op = readBytecodeWord(bytecode, conditionBase + 2)
      const encodedRaw = readBytecodeWord(bytecode, conditionBase + 3)
      const valueRaw = readFieldValueRaw(heap, blockPtr, fieldIndex)

      if (!evaluateCondition(heap, bytecode, op, fieldType, valueRaw, encodedRaw, condValuesBase)) {
        passed = false
        break
      }
    }

    if (passed) {
      return targetState
    }
  }

  return currentState
}
