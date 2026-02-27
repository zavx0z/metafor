/**
 * Компиляция суперпозиций в байт-код для GPU.
 *
 * Преобразует декларативные графы состояний в линейный байт-код,
 * оптимизированный для выполнения на WebGPU.
 *
 * @packageDocumentation
 */

import { parseCondition } from "./condition"
import { encodeValue, fieldTypeToBytecodeType } from "./params"
import type { Field } from "./index.t"
import type { Collapse } from "./index.t"
import type { FieldBytecode, CompiledRules } from "./superposition.t"
import type { EncodingContext } from "./params.t"

/**
 * Компилирует одну суперпозицию в байт-код.
 *
 * @param collapses - Граф переходов: collapses[fromState][transitionIndex] = [targetState, conditions]
 * @param fields - Определение полей для кодирования значений
 * @returns Байт-код и смещение для GPU
 */
export function compileSuperposition(
  collapses: Collapse[][],
  fields: Field[]
): FieldBytecode {
  const bytecode: number[] = []
  const statePtrs: number[] = []

  // 1. Сначала собираем указатели на состояния (заполним позже)
  for (let s = 0; s < collapses.length; s++) {
    statePtrs.push(0) // placeholder
  }

  // 2. Компилируем каждое состояние
  for (let s = 0; s < collapses.length; s++) {
    const stateStart = bytecode.length
    statePtrs[s] = stateStart

    const transitions = collapses[s]!
    bytecode.push(transitions.filter(t => t !== null).length) // tr_count

    for (const collapse of transitions) {
      if (collapse === null) continue

      const [targetState, conditions] = collapse
      bytecode.push(targetState)

      // Компилируем условия
      const condStart = bytecode.length
      bytecode.push(0) // cond_count placeholder

      const condChecks = compileConditions(conditions, fields)
      bytecode[condStart] = condChecks.length // записываем cond_count

      for (const check of condChecks) {
        bytecode.push(check.fieldType)
        bytecode.push(check.fieldIndex)
        bytecode.push(check.op)
        bytecode.push(check.valEncoded)
      }
    }
  }

  // 3. Вставляем указатели на состояния в начало
  const finalBytecode = [...statePtrs, ...bytecode]

  return {
    bytecode: new Uint32Array(finalBytecode),
    bytecodeOffset: 0,
  }
}

/**
 * Компилирует условия перехода в массив проверок.
 *
 * @param conditions - Record<fieldIndex, condition>
 * @param fields - Определение полей для кодирования
 * @returns Массив готовых инструкций для байт-кода
 */
export function compileConditions(
  conditions: Record<number, any>,
  fields: Field[]
): Array<{
  fieldType: number
  fieldIndex: number
  op: number
  valEncoded: number
}> {
  const result: Array<{
    fieldType: number
    fieldIndex: number
    op: number
    valEncoded: number
  }> = []

  for (const [fieldIndexStr, cond] of Object.entries(conditions)) {
    const fieldIndex = Number(fieldIndexStr)
    const field = fields[fieldIndex]
    if (!field) continue

    const checks = parseCondition(cond)
    const fieldType = fieldTypeToBytecodeType(field.type)

    for (const check of checks) {
      const ctx: EncodingContext = { type: fieldType }
      if (field.enum !== undefined) {
        ctx.enum = field.enum
      }
      const valEncoded = encodeValue(check.val, ctx)

      result.push({
        fieldType,
        fieldIndex,
        op: check.op,
        valEncoded,
      })
    }
  }

  return result
}

/**
 * Компилирует ансамбль суперпозиций всех бран.
 *
 * @param branes - Массив бран с их суперпозициями
 * @param fields - Общие определения полей
 * @returns Объединённый байт-код и смещения
 */
export function compileEnsemble(
  branes: Array<{ collapses: Collapse[][] }>,
  fields: Field[]
): CompiledRules {
  const allBytecode: number[] = []
  const offsets: number[] = []

  for (const brane of branes) {
    const { bytecode } = compileSuperposition(brane.collapses, fields)
    offsets.push(allBytecode.length)
    allBytecode.push(...bytecode)
  }

  return {
    bytecode: new Uint32Array(allBytecode),
    bytecodeOffsets: new Uint32Array(offsets),
  }
}