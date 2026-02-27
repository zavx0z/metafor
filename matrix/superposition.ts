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
 * Формат bytecode (как в boundary/):
 * ```
 * Индексы:  [0, 1, ...]              [N, N+1, ...]                [...]
 *           [state_ptr_0, ...]       [tr_count, target, cond_ptr] [cond_count, type, ...]
 *           ↑ state table            ↑ state blocks               ↑ condition blocks
 * ```
 *
 * @param collapses - Граф переходов: collapses[fromState][transitionIndex] = [targetState, conditions]
 * @param fields - Определение полей для кодирования значений
 * @returns Байт-код и смещение для GPU
 */
export function compileSuperposition(
  collapses: Collapse[][],
  fields: Field[]
): FieldBytecode {
  const numStates = collapses.length
  
  // === PASS 1: Собираем condition blocks и считаем размеры ===
  const condBlocks: number[][] = []
  const stateTransitionsCount: number[] = []  // количество transition для каждого состояния
  
  for (const stateTransitions of collapses) {
    const trCount = stateTransitions.filter(t => t !== null).length
    stateTransitionsCount.push(trCount)
    
    for (const collapse of stateTransitions) {
      if (collapse === null) continue
      const [, conditions] = collapse
      
      const condChecks = compileConditions(conditions, fields)
      const condBlock: number[] = [condChecks.length]
      for (const check of condChecks) {
        condBlock.push(check.fieldType)
        condBlock.push(check.fieldIndex)
        condBlock.push(check.op)
        condBlock.push(check.valEncoded)
      }
      condBlocks.push(condBlock)
    }
  }
  
  // Вычисляем смещения секций
  const stateTableLength = numStates
  const stateBlocksLength = stateTransitionsCount.reduce((sum, trCount) => sum + 1 + trCount * 2, 0)
  const condBlocksStart = stateTableLength + stateBlocksLength
  
  // === PASS 2: Строим state table и state blocks с правильными указателями ===
  const statePtrs: number[] = []
  const stateBlocks: number[] = []
  
  let condBlockIdx = 0
  let condBlockOffset = condBlocksStart
  
  for (let s = 0; s < numStates; s++) {
    // state_ptr — абсолютное смещение в bytecode (относительно начала)
    const stateBlockStart = stateTableLength + stateBlocks.length
    statePtrs.push(stateBlockStart)
    
    const transitions = collapses[s]!
    const trCount = stateTransitionsCount[s]!
    stateBlocks.push(trCount)
    
    for (const collapse of transitions) {
      if (collapse === null) continue
      
      const [targetState] = collapse
      stateBlocks.push(targetState)
      stateBlocks.push(condBlockOffset)
      
      // Переходим к следующему condition block
      condBlockOffset += condBlocks[condBlockIdx]!.length
      condBlockIdx++
    }
  }

  // === PASS 3: Собираем финальный массив ===
  const finalBytecode = [...statePtrs, ...stateBlocks, ...condBlocks.flat()]

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
