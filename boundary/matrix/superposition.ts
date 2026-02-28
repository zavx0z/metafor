/**
 * Компиляция суперпозиций в байт-код для GPU.
 *
 * Преобразует декларативные графы состояний в линейный байт-код,
 * оптимизированный для выполнения на WebGPU.
 *
 * @packageDocumentation
 */

import { parseCondition } from "./condition"
import { OP, TYPE } from "./opcodes"
import { encodeValue, fieldTypeToBytecodeType } from "./params"
import type { Field } from "./index.t"
import type { Collapse } from "./index.t"
import type { FieldBytecode, CompiledRules, ConditionInstruction } from "./superposition.t"
import type { EncodingContext } from "./params.t"
import type { ParsedCheck } from "./condition.t"

/**
 * Результат компиляции условий с кучей для списков.
 */
export interface CompiledConditionsResult {
  /** Инструкции условий. */
  instructions: ConditionInstruction[]
  /** Куча для списков (IN/NOT_IN): [count, item1, item2, ...]. */
  heap: number[]
}

/**
 * Компилирует одну суперпозицию в байт-код.
 *
 * Формат bytecode (как в boundary/):
 * ```
 * Индексы:  [0, 1, ...]              [N, N+1, ...]                [...]
 *           [state_ptr_0, ...]       [tr_count, target, cond_ptr] [cond_count, type, ...]
 *           ↑ state table            ↑ state blocks               ↑ condition blocks
 *                                      + heap для списков IN/NOT_IN
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

  // === PASS 1: Собираем condition blocks с кучами ===
  const condBlocksData: { instructions: number[], heap: number[] }[] = []
  const stateTransitionsCount: number[] = []

  for (const stateTransitions of collapses) {
    const trCount = stateTransitions.filter(t => t !== null).length
    stateTransitionsCount.push(trCount)

    for (const collapse of stateTransitions) {
      if (collapse === null) continue
      const [, conditions] = collapse

      // Парсим условия перед компиляцией (принцип готового формата данных)
      const parsedChecks = Object.entries(conditions).map(([fieldIdxStr, condValue]) => ({
        fieldIndex: Number(fieldIdxStr),
        checks: parseCondition(condValue),
      }))

      const { instructions, heap } = compileParsedConditions(parsedChecks, fields)

      // Собираем instructions в плоский массив
      const instrFlat: number[] = [instructions.length]  // cond_count
      for (const instr of instructions) {
        instrFlat.push(instr.fieldType)
        instrFlat.push(instr.fieldIndex)
        instrFlat.push(instr.op)
        instrFlat.push(instr.valEncoded)
      }

      condBlocksData.push({ instructions: instrFlat, heap })
    }
  }

  // Вычисляем смещения секций
  const stateTableLength = numStates
  // Для каждого состояния: 1 (tr_count) + trCount * 2 (target + cond_ptr)
  // Для null transition тоже добавляем 2 placeholder
  const stateBlocksLength = collapses.reduce((sum, transitions) => {
    const trCount = transitions.filter(t => t !== null).length
    const nullCount = transitions.filter(t => t === null).length
    return sum + 1 + trCount * 2 + nullCount * 2
  }, 0)
  const condBlocksStart = stateTableLength + stateBlocksLength

  // Считаем полные размеры condition blocks (instructions + heap)
  const condBlockSizes = condBlocksData.map(b => b.instructions.length + b.heap.length)

  // === PASS 2: Строим state table и state blocks с правильными указателями ===
  const statePtrs: number[] = []
  const stateBlocks: number[] = []

  let condBlockIdx = 0
  let condBlockOffset = condBlocksStart

  for (let s = 0; s < numStates; s++) {
    // state_ptr — абсолютное смещение в bytecode (относительно начала)
    // stateBlocksStart = stateTableLength + текущая длина stateBlocks
    const stateBlockStart = stateTableLength + stateBlocks.length
    statePtrs.push(stateBlockStart)

    const transitions = collapses[s]!
    const trCount = stateTransitionsCount[s]!
    stateBlocks.push(trCount)

    for (const collapse of transitions) {
      if (collapse === null) {
        stateBlocks.push(0)  // target placeholder
        stateBlocks.push(0)  // cond_ptr placeholder
        continue
      }

      const [targetState] = collapse
      stateBlocks.push(targetState)
      stateBlocks.push(condBlockOffset)

      // Переходим к следующему condition block
      condBlockOffset += condBlockSizes[condBlockIdx]!
      condBlockIdx++
    }
  }

  // === PASS 3: Собираем финальный bytecode ===
  const finalBytecode = [...statePtrs, ...stateBlocks]

  // Добавляем condition blocks с кучами
  for (const block of condBlocksData) {
    finalBytecode.push(...block.instructions)
    finalBytecode.push(...block.heap)
  }

  return {
    bytecode: new Uint32Array(finalBytecode),
    bytecodeOffset: 0,
  }
}

/**
 * Определяет контекст кодирования для операторов массивов.
 *
 * ## Логика выбора контекста:
 *
 * | Оператор | Контекст |
 * | -------- | -------- |
 * | INCLUDE, NOT_INCLUDE | subType элемента массива |
 * | LENGTH, IS_EMPTY | UINT (сравнение длины) |
 * | GT, LT, GTE, LTE, EQ, NEQ | UINT (сравнение длины) |
 *
 * @param ctx - Исходный контекст поля (с subType для массивов)
 * @param op - Код операции
 * @param fieldType - Тип поля
 * @returns Контекст для кодирования значения в байт-код
 */
function getArrayEncodingContext(
  ctx: EncodingContext,
  op: number,
  fieldType: number,
): EncodingContext {
  if (fieldType !== TYPE.ARRAY) {
    return ctx
  }

  // Для INCLUDE/NOT_INCLUDE используем subType элемента
  if (
    ctx.subType !== undefined &&
    (op === OP.INCLUDE || op === OP.NOT_INCLUDE)
  ) {
    return { type: ctx.subType }
  }

  // Для LENGTH, IS_EMPTY и сравнений длины — UINT
  return { type: TYPE.UINT }
}

/**
 * Компилирует распарсенные условия перехода в массив проверок.
 *
 * Для операторов IN/NOT_IN создаёт кучу со списком значений.
 * Для STRING элементов в списках — интернирует и сохраняет string_id.
 *
 * @param parsedChecks - Массив распарсенных проверок: { fieldIndex, checks }
 * @param fields - Определение полей для кодирования
 * @returns Инструкции и куча для списков
 */
export function compileParsedConditions(
  parsedChecks: Array<{ fieldIndex: number; checks: ParsedCheck[] }>,
  fields: Field[]
): CompiledConditionsResult {
  const instructions: ConditionInstruction[] = []
  const heap: number[] = []

  // Сначала собираем все проверки чтобы посчитать totalInstructionsSize
  const allChecks: Array<{
    fieldIndex: number
    fieldType: number
    op: number
    val: any
  }> = []

  for (const { fieldIndex, checks } of parsedChecks) {
    const field = fields[fieldIndex]
    if (!field) continue

    const fieldType = fieldTypeToBytecodeType(field.type)

    for (const check of checks) {
      allChecks.push({
        fieldIndex,
        fieldType,
        op: check.op,
        val: check.val,
      })
    }
  }

  // Считаем размер инструкций (4 слова на каждую)
  const totalInstructionsSize = allChecks.length * 4

  // Куча начинается после всех инструкций
  let heapOffset = totalInstructionsSize

  // Генерируем инструкции с правильными указателями
  for (const check of allChecks) {
    const ctx: EncodingContext = { type: check.fieldType }
    const field = fields[check.fieldIndex]
    if (field?.enum !== undefined) {
      ctx.enum = field.enum
    }
    // Для массивов добавляем subType
    if (field?.elementType !== undefined) {
      switch (field.elementType) {
        case "number":
          ctx.subType = TYPE.FLOAT
          break
        case "string":
          ctx.subType = TYPE.STRING
          break
        case "boolean":
          ctx.subType = TYPE.BOOL
          break
      }
    }

    let valEncoded: number

    // Для IN/NOT_IN — создаём кучу со списком
    if (Array.isArray(check.val) && (check.op === OP.IN || check.op === OP.NOT_IN)) {
      // ptr — смещение от базы инструкций до кучи
      const ptr = heapOffset
      heap.push(check.val.length)  // count
      for (const v of check.val) {
        // Для ENUM элементов в списке — конвертируем в индекс и кодируем
        if (ctx.enum !== undefined && typeof v === "string") {
          const idx = ctx.enum.indexOf(v)
          if (idx === -1) {
            throw new Error(`Value '${v}' not found in enum: [${ctx.enum}]`)
          }
          heap.push(encodeValue(idx, ctx).value1)
        }
        // Для STRING элементов в списке — используем encodeValue
        else if (check.fieldType === TYPE.STRING && typeof v === "string") {
          heap.push(encodeValue(v, ctx).value1)
        } else {
          heap.push(encodeValue(v, ctx).value1)
        }
      }
      // Обновляем heapOffset для следующей кучи
      heapOffset += 1 + check.val.length
      instructions.push({
        fieldType: check.fieldType,
        fieldIndex: check.fieldIndex,
        op: check.op,
        valEncoded: ptr,
      })
    } else {
      // Для STRING — используем encodeValue (возвращает string_id)
      if (check.fieldType === TYPE.STRING && typeof check.val === "string") {
        valEncoded = encodeValue(check.val, ctx).value1
      } else {
        // Для ARRAY операторов используем специальный контекст
        const encodeCtx = getArrayEncodingContext(ctx, check.op, check.fieldType)

        // Для ENUM строк в условиях типа gt: "MAGE" — конвертируем в индекс
        let valToEncode = check.val
        if (encodeCtx.enum !== undefined && typeof check.val === "string") {
          const idx = encodeCtx.enum.indexOf(check.val)
          if (idx === -1) {
            throw new Error(`Value '${check.val}' not found in enum: [${encodeCtx.enum}]`)
          }
          valToEncode = idx
        }
        valEncoded = encodeValue(valToEncode, encodeCtx).value1
      }
      
      instructions.push({
        fieldType: check.fieldType,
        fieldIndex: check.fieldIndex,
        op: check.op,
        valEncoded,
      })
    }
  }

  return { instructions, heap }
}

/**
 * Компилирует условия перехода в массив проверок.
 *
 * Обёртка для тестов — парсит сырые условия и вызывает compileParsedConditions().
 *
 * @param conditions - Record<fieldIndex, condition> (сырые условия)
 * @param fields - Определение полей для кодирования
 * @returns Инструкции и куча для списков
 */
export function compileConditions(
  conditions: Record<number, any>,
  fields: Field[]
): CompiledConditionsResult {
  const parsedChecks = Object.entries(conditions).map(([fieldIdxStr, condValue]) => ({
    fieldIndex: Number(fieldIdxStr),
    checks: parseCondition(condValue),
  }))
  return compileParsedConditions(parsedChecks, fields)
}

/**
 * Компилирует ансамбль суперпозиций всех бран.
 *
 * **Side Effects:** Вызывает `encodeValue()` для строк в IN-списках,
 * что интернирует строки в глобальный StringAtlas.
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
