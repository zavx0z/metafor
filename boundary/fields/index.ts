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
 * const changes = await update([[0, [[0, 100]]]])
 * ```
 */

import { getStringAtlas, resetStringAtlas } from "@boundary/atlas"
import {
  _initMatrix,
  _stepMatrix,
  _readMatrixChanges,
  _updateMatrixHeap,
  resetMatrix,
  getMatrixState as getMatrixRuntimeState,
} from "@boundary/matrix"
import { serializeMatrix, deserializeMatrix } from "@boundary/dump"
import type { MatrixState as DumpMatrixState } from "@boundary/dump"

import { validateData } from "./validate"
import { prepareData, type PreparedData } from "./prepare"
import { buildHeap, findFieldOffset, packMeta, unpackMeta } from "./heap"
import type { HeapInput } from "./heap.t"
import { compileEnsemble, compileSuperposition, compileParsedConditions } from "./superposition"
import type { CompiledRules } from "./superposition.t"
import { encodeValue, encodeFieldValue, fieldTypeToBytecodeType, floatToUint, uintToFloat } from "./values"
import type { EncodingContext } from "./values.t"
import { findEntangledGroups, buildBraneMapping } from "./entangled"
import { parseCondition } from "./condition"
import { OP, TYPE } from "./opcodes"
import type { Data, Field } from "./index.t"

export {
  // Основное API
  validateData,
  prepareData,
  // Heap
  buildHeap,
  findFieldOffset,
  packMeta,
  unpackMeta,
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
  // Internal
  reset,
  getMatrixState,
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
 * Определение полей из последнего вызова `write()`.
 */
let fields: Field[] = []

/**
 * Bytecode правила из последнего вызова `write()`.
 */
let bytecode: Uint32Array | null = null

/**
 * Bytecode offsets из последнего вызова `write()`.
 */
let bytecodeOffsets: Uint32Array | null = null

/**
 * Начальные состояния из последнего вызова `write()`.
 */
let initialStates: Uint32Array | null = null

/**
 * Mutex для предотвращения конкурентных вызовов write().
 */
let writeMutex: Promise<void> | null = null

/**
 * Mutex для предотвращения конкурентных вызовов update().
 */
let updateMutex: Promise<void> | null = null

/**
 * Сбрасывает состояние модуля (для тестов).
 * @internal
 */
function reset(): void {
  fields = []
  bytecode = null
  bytecodeOffsets = null
  initialStates = null
  writeMutex = null
  updateMutex = null
  resetMatrix()
  resetStringAtlas()
}

/**
 * Внутреннее состояние для сериализации.
 */
interface MatrixStateInternal {
  heap: Uint32Array
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
  states: Uint32Array
  stringRegistry: Uint32Array
  stringHeap: Uint32Array
  fields: Field[]
  metadata: {
    arrayReserveSize: number
    heapAllocOffset: number
    braneBlockPtrs: number[]
  }
}

/**
 * Получает полное состояние матрицы для сериализации.
 *
 * @returns Состояние для serializeMatrix()
 */
function getMatrixState(): MatrixStateInternal {
  const runtimeState = getMatrixRuntimeState()
  const atlas = getStringAtlas()
  const atlasExport = atlas.exportData()

  return {
    heap: runtimeState.heap,
    bytecode: bytecode!,
    bytecodeOffsets: bytecodeOffsets!,
    states: initialStates!,
    stringRegistry: atlasExport.registry,
    stringHeap: atlasExport.heap,
    fields,
    metadata: {
      arrayReserveSize: runtimeState.arrayReserveSize,
      heapAllocOffset: runtimeState.heapAllocOffset,
      braneBlockPtrs: runtimeState.braneBlockPtrs,
    },
  }
}

// ============================================================================
// ОСНОВНОЕ API: write() и update()
// ============================================================================

/**
 * Инициализирует матрицу (загружает данные на GPU) и возвращает начальные состояния.
 *
 * @remarks
 * **Side Effects:**
 * - Сбрасывает StringAtlas
 * - Аллоцирует GPU-буферы
 * - Выполняет step() для установки начальных состояний
 * - Возвращает изменённые состояния после инициализации
 *
 * **Потокобезопасность:**
 * - Функция использует mutex для предотвращения конкурентных вызовов
 * - При одновременных вызовах второй будет ожидать завершения первого
 *
 * @param data - Конфигурация полей и бран
 * @returns Массив изменённых состояний: `[[braneIndex, newState], ...]`
 *
 * @example
 * ```typescript
 * // Инициализация с возвратом начальных состояний
 * const initialStates = await write({
 *   fields: [{ type: FieldType.F32 }],
 *   branes: [{ params: [[0, 100]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null]] }],
 * })
 * // initialStates = [[0, 1]] — брана 0 перешла в состояние 1 (100 > 50)
 * ```
 */
export async function write(data: Data): Promise<[number, number][]> {
  // Блокировка mutex для предотвращения конкурентных вызовов
  if (writeMutex) {
    await writeMutex
  }

  // Создаём promise для текущей операции (захват mutex)
  let resolveMutex: (() => void) | undefined
  writeMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  try {
    // 0. Валидация входных данных
    validateData(data)

    // 1. Сброс предыдущего состояния
    reset()
    resetStringAtlas() // Side effect перед prepareData()

    // 2. Подготовка данных (с side effects для интернирования строк)
    const prepared = prepareData(data)

    // 3. Сохраняем глобальное состояние
    fields = data.fields
    bytecode = prepared.compiledRules.bytecode
    bytecodeOffsets = prepared.compiledRules.bytecodeOffsets
    initialStates = prepared.initialStates

    // 4. Инициализация GPU
    const atlasExport = getStringAtlas().exportData()
    await _initMatrix(
      {
        bytecode: prepared.compiledRules.bytecode,
        bytecodeOffsets: prepared.compiledRules.bytecodeOffsets,
        states: prepared.initialStates,
        braneDescriptors: buildBraneDescriptors(prepared.heapLayout.blockPtrs, prepared.compiledRules.bytecodeOffsets),
        heap: prepared.heapData,
      },
      atlasExport,
      prepared.heapLayout.blockPtrs,
      prepared.arrayReserveSize,
    )

    // 5. Выполняем step() после инициализации
    _stepMatrix()

    // 6. Возвращаем состояния после инициализации
    return await _readMatrixChanges()
  } finally {
    // Освобождение mutex
    resolveMutex?.()
  }
}

/**
 * Обновляет поля бран и возвращает новые состояния.
 *
 * @remarks
 * **Side Effects:**
 * - Обновляет heap
 * - Выполняет step() автоматически
 * - Читает состояния из GPU
 * - Сбрасывает heapAllocOffset после шага (для повторного использования зоны ARRAY)
 *
 * **Потокобезопасность:**
 * - Функция использует mutex для предотвращения конкурентных вызовов
 *
 * **ARRAY поля:**
 * - Данные массивов хранятся во временной зоне heap
 * - **После каждого `update()` зона очищается** (данные массива не сохраняются)
 *
 * **Блокировка переходов:**
 * - Третий элемент кортежа `lock` управляет блокировкой индивидуально для каждой браны
 * - `lock: true` — заблокировать переходы (состояние не изменится)
 * - `lock: false` — разблокировать переходы
 * - `lock: undefined` — не менять текущий lock флаг
 * - Lock флаг сохраняется между вызовами до явной смены
 *
 * @param updates - Массив обновлений: `[[braneIndex, [[fieldIndex, value], ...], lock?], ...]`
 * @returns Массив состояний: `[[braneIndex, state], ...]`
 *
 * @example
 * ```typescript
 * // Обновление одного поля одной браны
 * await update([[0, [[0, 100]]]])
 *
 * // Обновление с блокировкой
 * await update([[0, [[0, 100]], true]])
 *
 * // Разблокировать без изменения полей
 * await update([[0, [], false]])
 *
 * // Несколько бран с разной блокировкой
 * await update([
 *   [0, [[0, 100]], true],   // Заблокировать
 *   [1, [[0, 50]]],          // lock не меняется
 *   [2, [[0, 30]], false],   // Разблокировать
 * ])
 * ```
 */
export async function update(
  updates: Array<[
    braneIndex: number,
    fieldUpdates: Array<[fieldIndex: number, value: unknown]>,
    lock?: boolean
  ]>,
): Promise<[number, number][]> {
  // Блокировка mutex для предотвращения конкурентных вызовов
  if (updateMutex) {
    await updateMutex
  }

  // Создаём promise для текущей операции (захват mutex)
  let resolveMutex: (() => void) | undefined
  updateMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  try {
    const state = getMatrixRuntimeState()
    if (!state.heap) {
      throw new Error("Matrix not initialized. Call write() first.")
    }

    const { heap, braneBlockPtrs, arrayReserveSize } = state

    // Этап 1: Кодирование всех обновлений для всех бран
    const allHeapUpdates: Array<{ offset: number; value1: number; value2?: number }> = []

    for (const [braneIndex, fieldUpdates, lock] of updates) {
      if (braneIndex < 0 || braneIndex >= braneBlockPtrs.length) {
        throw new Error(`Brane index out of range: ${braneIndex}`)
      }

      const blockPtr = braneBlockPtrs[braneIndex]!

      // Обновление lock флага (если указан)
      if (lock !== undefined) {
        heap[blockPtr + 2] = lock ? 1 : 0
        allHeapUpdates.push({ offset: blockPtr + 2, value1: lock ? 1 : 0 })
      }

      for (const [fieldIndex, value] of fieldUpdates) {
        // Поиск смещения поля
        const fieldOffset = findFieldOffsetInHeap(heap, blockPtr, fieldIndex)
        if (fieldOffset === null) {
          throw new Error(`Field ${fieldIndex} not found in brane ${braneIndex}`)
        }

        // Получение определения поля
        const field = fields[fieldIndex]
        if (!field) {
          throw new Error(`Field ${fieldIndex} not defined`)
        }

        // Кодирование значения
        const encoded = encodeFieldUpdate(value, field, heap, state)
        const fieldType = fieldTypeToBytecodeType(field.type)

        // Обновление heap (локально)
        writeValueToHeap(heap, fieldOffset, fieldType, encoded.value1, encoded.value2)

        // Добавление в список обновлений GPU
        if (fieldType === TYPE.ARRAY && Array.isArray(value)) {
          // Pointer и reserved
          allHeapUpdates.push({ offset: fieldOffset, value1: encoded.value1, value2: encoded.value2 })
          // Данные массива: [length, item1, item2, ...]
          const arrayData = heap.slice(encoded.value1, encoded.value1 + 1 + (value as unknown[]).length)
          for (let i = 0; i < arrayData.length; i++) {
            allHeapUpdates.push({ offset: encoded.value1 + i, value1: arrayData[i]! })
          }
        } else if (fieldType === TYPE.STRING) {
          allHeapUpdates.push({ offset: fieldOffset, value1: encoded.value1, value2: encoded.value2 })
        } else {
          allHeapUpdates.push({ offset: fieldOffset, value1: encoded.value1 })
        }
      }
    }

    // Этап 2: Частичная запись в GPU (все изменения за раз)
    _updateMatrixHeap(allHeapUpdates)

    // Этап 3: GPU step + read
    _stepMatrix()
    const changes = await _readMatrixChanges()

    return changes
  } finally {
    // Освобождение mutex
    resolveMutex?.()
  }
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Результат кодирования обновления поля.
 */
interface EncodedFieldUpdate {
  value1: number
  value2: number
}

/**
 * Этап 2: Кодирование значения для обновления поля.
 *
 * @param value - Новое значение
 * @param field - Определение поля
 * @param heap - Heap данные
 * @param state - Текущее состояние matrix
 * @returns Закодированное значение (value1, value2)
 */
function encodeFieldUpdate(
  value: unknown,
  field: Field,
  heap: Uint32Array,
  state: ReturnType<typeof getMatrixRuntimeState>,
): EncodedFieldUpdate {
  const fieldType = fieldTypeToBytecodeType(field.type)
  const context: EncodingContext = { type: fieldType }
  if (field.enum !== undefined) {
    context.enum = field.enum
  }
  // Для массивов добавляем subType
  if (field.elementType !== undefined) {
    switch (field.elementType) {
      case "number":
        context.subType = TYPE.FLOAT
        break
      case "string":
        context.subType = TYPE.STRING
        break
      case "boolean":
        context.subType = TYPE.BOOL
        break
    }
  }

  let value1: number
  let value2 = 0 // Для STRING (hash) и ARRAY (reserved)

  // Для STRING — интернируем и получаем hash
  if (fieldType === TYPE.STRING && typeof value === "string") {
    const encoded = encodeValue(value, context)
    value1 = encoded.value1
    value2 = encoded.value2
  }
  // Для ARRAY — аллоцируем место в heap и кодируем элементы
  else if (fieldType === TYPE.ARRAY && Array.isArray(value)) {
    const arr = value as unknown[]
    // Аллоцируем: [length, item1, item2, ...]
    const arraySize = 1 + arr.length
    const heapAllocOffset = state.heapAllocOffset

    if (heapAllocOffset + arraySize > heap.length) {
      throw new Error(`Heap overflow: need ${heapAllocOffset + arraySize}, have ${heap.length}`)
    }

    // Записываем длину
    heap[heapAllocOffset] = arr.length
    // Кодируем и записываем элементы
    const elementType = context.subType ?? TYPE.FLOAT
    for (let i = 0; i < arr.length; i++) {
      const itemCtx: EncodingContext = { type: elementType }
      heap[heapAllocOffset + 1 + i] = encodeValue(arr[i], itemCtx).value1
    }

    value1 = heapAllocOffset // pointer to array data
    value2 = 0 // reserved
  } else {
    value1 = encodeValue(value, context).value1
  }

  return { value1, value2 }
}

/**
 * Построить braneDescriptors: [block_ptr0, bytecode_offset0, ...]
 */
function buildBraneDescriptors(blockPtrs: number[], offsets: Uint32Array): Uint32Array {
  const descriptors = new Uint32Array(blockPtrs.length * 2)
  for (let i = 0; i < blockPtrs.length; i++) {
    descriptors[i * 2] = blockPtrs[i] ?? 0
    descriptors[i * 2 + 1] = offsets[i] ?? 0
  }
  return descriptors
}

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
  // Ищем в локальных полях
  const localOffset = findFieldOffset(heap, blockPtr, fieldIndex)
  if (localOffset !== null) {
    return localOffset
  }

  // Ищем в entangled блоках
  const localCount = heap[blockPtr] ?? 0
  const entangledCount = heap[blockPtr + 1] ?? 0
  const entangledPtrsOffset = blockPtr + 3 + localCount * 2  // +3 для заголовка (local_count, entangled_count, lock)

  for (let i = 0; i < entangledCount; i++) {
    const entangledPtr = heap[entangledPtrsOffset + i] ?? 0
    if (entangledPtr === 0) continue

    const entangledOffset = findFieldOffset(heap, entangledPtr, fieldIndex)
    if (entangledOffset !== null) {
      return entangledOffset
    }
  }

  return null
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
