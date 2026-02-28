/**
 * @boundary/fields — оркестрация данных для GPU-эволюции суперпозиций.
 *
 * @packageDocumentation
 *
 * ## Архитектура
 *
 * Модуль реализует конвейер данных для выполнения FSM на GPU:
 *
 * 1. **validateData()** — валидация входных данных (чистая функция)
 * 2. **prepareData()** — кодирование, компиляция, построение heap (side effects для StringAtlas)
 * 3. **write()** — инициализация GPU (оркестратор)
 * 4. **update()** — эволюция (оркестратор)
 *
 * ## Принцип работы
 *
 * Каждая брана — это набор полей в heap с индивидуальным bytecode FSM.
 * Compute shader выполняет все переходы параллельно (1 поток на брану).
 *
 * @example
 * ```typescript
 * import { write, update } from "@boundary/fields"
 * import { FieldType } from "@boundary/fields"
 * import { getMatrixState, initMatrixGPU } from "@boundary/matrix"
 *
 * // Инициализация
 * await write({
 *   fields: [{ type: FieldType.F32 }],
 *   branes: [{
 *     params: [[0, 100]],
 *     state: 0,
 *     collapses: [[[1, { 0: { gt: 50 } }]], [null]],
 *   }],
 * })
 *
 * // Эволюция
 * const changes = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
 * ```
 */

import { validateData } from "./validate"
import { prepareData, type PreparedData } from "./prepare"
import { buildHeap, findFieldOffset } from "./heap"
import type { HeapInput } from "./heap.t"
import { compileEnsemble, compileSuperposition, compileParsedConditions } from "./superposition"
import type { CompiledRules } from "./superposition.t"
import { encodeValue, fieldTypeToBytecodeType, floatToUint, uintToFloat } from "./params"
import type { EncodingContext } from "./params.t"
import { findEntangledGroups, buildBraneMapping } from "./entangled"
import { parseCondition } from "./condition"
import { OP, TYPE } from "./opcodes"

export {
  // Основное API
  validateData,
  prepareData,
  // Heap
  buildHeap,
  findFieldOffset,
  // Superposition
  compileEnsemble,
  compileSuperposition,
  compileParsedConditions,
  // Params
  encodeValue,
  encodeFieldValue,
  fieldTypeToBytecodeType,
  floatToUint,
  uintToFloat,
  // Entangled
  findEntangledGroups,
  buildBraneMapping,
  // Condition
  parseCondition,
  // Opcodes
  OP,
  TYPE,
}

export type {
  PreparedData,
  CompiledRules,
  EncodingContext,
  HeapInput,
}

// Ре-экспорт типов
export { FieldType } from "./index.t"
export type {
  FieldTypeValue,
  Field,
  Brane,
  Data,
  Collapse,
  BraneParamValue,
} from "./index.t"

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ (fp.md п.5)
// ============================================================================

/**
 * Глобальное состояние модуля.
 * Сбрасывается при вызове `resetFields()`.
 */
let state: {
  heap: Uint32Array | null
  fields: import("./index.t").Field[]
  braneBlockPtrs: number[]
  bytecodeOffsets: Uint32Array | null
  braneCount: number
  initialStates: Uint32Array | null
  heapAllocOffset: number
  arrayReserveSize: number
  arrayDataInvalidated: boolean
  prepared: PreparedData | null
} = {
  heap: null,
  fields: [],
  braneBlockPtrs: [],
  bytecodeOffsets: null,
  braneCount: 0,
  initialStates: null,
  heapAllocOffset: 0,
  arrayReserveSize: 0,
  arrayDataInvalidated: false,
  prepared: null,
}

/**
 * Сбрасывает состояние модуля (для тестов).
 * @internal
 */
export function resetFields(): void {
  state = {
    heap: null,
    fields: [],
    braneBlockPtrs: [],
    bytecodeOffsets: null,
    braneCount: 0,
    initialStates: null,
    heapAllocOffset: 0,
    arrayReserveSize: 0,
    arrayDataInvalidated: false,
    prepared: null,
  }
}

/**
 * Получает текущее состояние модуля.
 *
 * @returns Глобальное состояние
 */
export function getFieldsState(): typeof state {
  return state
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Найти смещение поля в heap для браны.
 *
 * @param heap - Heap данные
 * @param blockPtr - Смещение блока браны
 * @param fieldIndex - Индекс поля
 * @returns Смещение значения или null
 */
export function findFieldOffsetInHeap(
  heap: Uint32Array,
  blockPtr: number,
  fieldIndex: number,
): number | null {
  return findFieldOffset(heap, blockPtr, fieldIndex)
}

/**
 * Записать значение в heap.
 *
 * @param heap - Heap данные
 * @param offset - Смещение для записи
 * @param fieldType - Тип поля
 * @param value1 - Первое слово значения
 * @param value2 - Второе слово значения (опционально)
 */
export function writeValueToHeap(
  heap: Uint32Array,
  offset: number,
  fieldType: number,
  value1: number,
  value2?: number,
): void {
  heap[offset] = value1
  if (value2 !== undefined && fieldType === TYPE.STRING) {
    heap[offset + 1] = value2
  }
}
