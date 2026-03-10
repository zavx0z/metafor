/**
 * @boundary/boundary — оркестратор детерминированной эволюции суперпозиций.
 *
 * @packageDocumentation
 *
 * ## Конвейер данных
 *
 * Модуль реализует минимальный рабочий контур Boundary:
 *
 * 1. **validateData()** — валидация входных данных
 * 2. **prepareData()** — передача flattened input в Fields для deduplication/compaction
 * 3. **write()** — фиксация canonical stored snapshot в global store
 * 4. **update()** — детерминированный шаг по heap и bytecode
 *
 * ## Принцип работы
 *
 * Boundary выполняет flattening, Fields строит canonical stored imprint,
 * а Matrix исполняет его на CPU/GPU. Источником истины является global store:
 * `heap`, `blockPtrs`, `bytecode`, `bytecodeOffsets`, `stringTable` и runtime `states`.
 *
 * ## Голографический принцип
 *
 * Boundary хранит всю информацию о системе в голографической форме:
 * - **Boundary** флаттенит вход на границе
 * - **Fields** записывает дедуплицированный отпечаток
 * - **Matrix** вычисляет эволюцию и пишет `states` обратно в тот же store
 *
 * ## Двусторонняя связь BULK ↔ FORCE ↔ BOUNDARY
 *
 * ```text
 * BULK (проявление)
 *   ↕
 *   Принимает ввод пользователя → передаёт в FORCE
 *   Отображает состояния ← получает из FORCE
 *
 * FORCE (взаимодействие)
 *   ↕
 *   Интерпретирует ввод → пишет в BOUNDARY
 *   Читает состояния ← получает из BOUNDARY
 *
 * BOUNDARY (поле)
 *   ↕
 *   Хранит всю информацию в heap
 *   Вычисляет эволюцию по законам (bytecode)
 * ```
 *
 * @example
 * ```typescript
 * import { write, update, FieldType } from "@boundary/boundary"
 *
 * // Инициализация
 * await write({
 *   fields: [{ type: FieldType.F32 }],
 *   branes: [{
 *     values: [[0, 100]],
 *     state: 0,
 *     collapses: [[[1, { 0: { gt: 50 } }]], [null]],
 *   }],
 * })
 *
 * // Эволюция
 * const changes = await update([[0, [[0, 100]]]])
 * ```
 */

import { matrixHeapUpdate, matrixInit, matrixRunStep, matrixStoreReset } from "./matrix"
import type { MatrixHeapUpdate } from "./matrix/matrix.t"
import { boundary$ } from "./store"
import { fields$ } from "./fields/store"

// Импорт чистых функций из @boundary/fields
import {
  validateData,
  findFieldOffset,
  createFieldEncodingContext,
  createStoredStringInterner,
  createStringAtlasExport,
  assembleStoredBoundaryData,
  encodeValue,
  fieldTypeToBytecodeType,
  parseCondition,
  TYPE,
  FieldType,
  type BraneValue,
  type Data,
  type Field,
  type FlattenedBoundaryInput,
  type StoredBoundaryData,
} from "./fields"

// ============================================================================
// ТИПЫ
// ============================================================================

/**
 * Подготовленные данные для runtime Boundary.
 */
export type PreparedData = StoredBoundaryData

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ============================================================================

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
  fields$.reset()
  writeMutex = null
  updateMutex = null
  matrixStoreReset()
}

// ============================================================================
// ОРКЕСТРАТОР: prepareData()
// ============================================================================

/**
 * Этап 1: Flattening boundary.
 *
 * Boundary принимает объектный ввод и переводит его в flat parsed IR.
 */
export function flattenBoundaryData(data: Data): FlattenedBoundaryInput {
  return {
    fields: [...(data.fields ?? [])],
    branes: (data.branes ?? []).map((brane) => ({
      values: brane.values.map(([fieldIndex, value]) => [fieldIndex, value] as [number, BraneValue]),
      state: brane.state,
      transitions: brane.collapses.map((stateTransitions) =>
        stateTransitions.map((collapse) =>
          collapse === null
            ? { targetState: null, conditions: [] }
            : {
                targetState: collapse[0],
                conditions: Object.entries(collapse[1]).map(([fieldIndex, condition]) => ({
                  fieldIndex: Number(fieldIndex),
                  checks: parseCondition(condition),
                })),
              },
        ),
      ),
    })),
    entanglement: data.entanglement,
  }
}

/**
 * Этап 2: Подготовка canonical stored data (deduplication, compaction, heap build).
 *
 * @remarks
 * @param data - Конфигурация полей и бран
 * @returns Canonical stored contract between Fields and Matrix
 */
export function prepareData(data: Data): PreparedData {
  return assembleStoredBoundaryData(flattenBoundaryData(data))
}

// ============================================================================
// ВНУТРЕННЕЕ СОСТОЯНИЕ ДЛЯ СЕРИАЛИЗАЦИИ
// ============================================================================

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
export function getMatrixState(): MatrixStateInternal {
  const localState = fields$
  const commonState = boundary$
  const atlasExport = createStringAtlasExport(commonState.stringTable)

  return {
    heap: commonState.heap,
    bytecode: commonState.bytecode,
    bytecodeOffsets: commonState.bytecodeOffsets,
    states: commonState.states,
    stringRegistry: atlasExport.registry,
    stringHeap: atlasExport.heap,
    fields: localState.fields,
    metadata: {
      arrayReserveSize: localState.arrayReserveSize,
      heapAllocOffset: localState.heapAllocOffset,
      braneBlockPtrs: commonState.blockPtrs,
    },
  }
}

// ============================================================================
// ОСНОВНОЕ API: write()
// ============================================================================

/**
 * Инициализирует boundary-снимок и возвращает начальные изменения.
 *
 * @remarks
 * **Side Effects:**
 * - Сбрасывает локальное deduplicated stored state
 * - Пересобирает canonical stored data (`heap`, `bytecode`, `states`, `blockPtrs`)
 * - НЕ выполняет шаг эволюции во время инициализации
 * - Возвращает изменения после инициализации (обычно пусто до первого `update()`)
 *
 * **Голографический принцип:**
 * - Boundary хранит всю информацию о системе в heap
 * - Каждая брана — возмущение квантового поля
 * - Entangled группы используют shared блоки для оптимизации памяти
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
 * // Инициализация без шага FSM
 * const initialChanges = await write({
 *   fields: [{ type: FieldType.F32 }],
 *   branes: [{ values: [[0, 100]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null]] }],
 * })
 * // initialChanges = [] до первого update()
 * ```
 */
export async function write(data: Data): Promise<[number, number][]> {
  // Блокировка mutex для предотвращения конкурентных вызовов
  const prevMutex = writeMutex
  let resolveMutex: (() => void) | undefined
  writeMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  // Ждём завершения предыдущей операции (если есть)
  if (prevMutex) {
    await prevMutex
  }

  try {
    // 0. Валидация входных данных
    validateData(data)

    // 1. Сброс предыдущего состояния
    fields$.reset()
    matrixStoreReset()

    // 2. Подготовка данных (с side effects для интернирования строк)
    const prepared = prepareData(data)

    // 3. Сохраняем локальное состояние (@boundary/fields/store)
    fields$.restore({
      fields: data.fields ?? [],
      stringTable: prepared.stringTable,
      stringInterner: createStoredStringInterner(prepared.stringTable),
      heapAllocOffset: prepared.heap.length - prepared.arrayReserveSize,
      arrayReserveSize: prepared.arrayReserveSize,
      arrayDataInvalidated: false,
    })

    // 4. Сохраняем общее состояние (@boundary/boundary/store)
    boundary$.restore({
      bytecode: prepared.bytecode,
      bytecodeOffsets: prepared.bytecodeOffsets,
      states: prepared.states,
      heap: prepared.heap,
      blockPtrs: prepared.blockPtrs,
      stringTable: prepared.stringTable,
    })

    await matrixInit(boundary$)

    // Минимальная рабочая реализация не выполняет шаг при write().
    return []
  } finally {
    // Освобождение mutex
    resolveMutex?.()
  }
}

// ============================================================================
// ОСНОВНОЕ API: update()
// ============================================================================

/**
 * Обновляет поля бран и возвращает новые состояния.
 *
 * @remarks
 * **Side Effects:**
 * - Обновляет heap
 * - Выполняет детерминированный шаг Boundary поверх текущего `heap`
 * - Обновляет локальный снимок состояний
 *
 * **Голографический принцип:**
 * - Обновления полей изменяют возмущения квантового поля
 * - Entangled группы обновляются системно (shared блоки)
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
  updates: Array<[braneIndex: number, fieldUpdates: Array<[fieldIndex: number, value: unknown]>, lock?: boolean]>,
): Promise<[number, number][]> {
  // Блокировка mutex для предотвращения конкурентных вызовов
  const prevMutex = updateMutex
  let resolveMutex: (() => void) | undefined
  updateMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  // Ждём завершения предыдущей операции (если есть)
  if (prevMutex) {
    await prevMutex
  }

  try {
    const commonState = boundary$
    const localState = fields$
    if (!localState.fields.length) {
      throw new Error("Store not initialized. Call write() first.")
    }

    const { heap, blockPtrs } = commonState
    const { fields, heapAllocOffset, stringInterner } = localState

    const allHeapUpdates: MatrixHeapUpdate[] = []

    for (const [braneIndex, fieldUpdates, lock] of updates) {
      if (braneIndex < 0 || braneIndex >= blockPtrs.length) {
        throw new Error(`Brane index out of range: ${braneIndex}`)
      }

      const blockPtr = blockPtrs[braneIndex]!

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
        const encoded = encodeFieldUpdate(value, field, heap, heapAllocOffset, stringInterner)
        const fieldType = fieldTypeToBytecodeType(field.type)

        // Обновление heap (локально)
        writeValueToHeap(heap, fieldOffset, fieldType, encoded.value1, encoded.value2)
        if (fieldType === TYPE.ARRAY && Array.isArray(value)) {
          allHeapUpdates.push({ offset: fieldOffset, value1: encoded.value1, value2: encoded.value2 })
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

    matrixHeapUpdate(allHeapUpdates)
    return await matrixRunStep()
  } finally {
    // Освобождение mutex
    resolveMutex?.()
  }
}

// ============================================================================
// ОСНОВНОЕ API: unlock()
// ============================================================================

/**
 * Снимает блокировку с указанных бран.
 *
 * @param indexes - Индексы бран в матрице, с которых снять блокировку.
 *
 * @remarks
 * Используется для разблокировки бран после завершения процессов.
 * Lock находится по смещению `blockPtr + 2` в heap.
 * Установка в `0` снимает блокировку.
 *
 * **Голографический принцип:**
 * - Снятие lock освобождает эволюцию системы
 * - Время (lock) движется дальше после releaseLock()
 *
 * @example
 * ```typescript
 * // Снять блокировку с бран 0, 1, 2
 * unlock([0, 1, 2])
 * ```
 */
export function unlock(indexes: number[]): void {
  const commonState = boundary$
  const { heap, blockPtrs } = commonState

  const unlockUpdates = indexes.map((index) => {
    const blockPtr = blockPtrs[index]
    if (blockPtr === undefined) {
      throw new Error(`Brane at index ${index} not found in boundary`)
    }
    heap[blockPtr + 2] = 0
    return { offset: blockPtr + 2, value1: 0 }
  })

  matrixHeapUpdate(unlockUpdates)
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
 * @param heapAllocOffset - Текущее смещение для ARRAY аллокаций
 * @returns Закодированное значение (value1, value2)
 */
function encodeFieldUpdate(
  value: unknown,
  field: Field,
  heap: Uint32Array,
  heapAllocOffset: number,
  stringInterner: { intern(value: string): number },
): EncodedFieldUpdate {
  const fieldType = fieldTypeToBytecodeType(field.type)
  const context = createFieldEncodingContext(fieldType, field, stringInterner)

  let value1: number
  let value2 = 0 // Для STRING/ARRAY второй слот зарезервирован

  // Для STRING — получаем canonical string_id
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

    if (heapAllocOffset + arraySize > heap.length) {
      throw new Error(`Heap overflow: need ${heapAllocOffset + arraySize}, have ${heap.length}`)
    }

    // Записываем длину
    heap[heapAllocOffset] = arr.length
    // Кодируем и записываем элементы
    const elementType = context.subType ?? TYPE.FLOAT
    for (let i = 0; i < arr.length; i++) {
      const itemCtx: EncodingContext = { type: elementType, stringInterner }
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
 * Найти смещение поля в heap для браны.
 *
 * @param heap - Heap данные
 * @param blockPtr - Смещение блока браны
 * @param fieldIndex - Индекс поля
 * @returns Смещение значения или null
 */
export function findFieldOffsetInHeap(heap: Uint32Array, blockPtr: number, fieldIndex: number): number | null {
  // Ищем в локальных полях
  const localOffset = findFieldOffset(heap, blockPtr, fieldIndex)
  if (localOffset !== null) {
    return localOffset
  }

  // Ищем в entangled блоках
  const localCount = heap[blockPtr] ?? 0
  const entangledCount = heap[blockPtr + 1] ?? 0
  const entangledPtrsOffset = blockPtr + 3 + localCount * 2

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

// Ре-экспорт типов
export type {
  Field,
  Data,
  Brane,
  Collapse,
  BraneValue,
  FieldTypeValue,
  FlattenedBoundaryInput,
  FlattenedBraneInput,
  FlattenedFieldChecks,
  FlattenedTransition,
  StoredBoundaryData,
  StoredEntangledBlock,
  StoredFieldMeta,
  StoredStringTable,
} from "./fields"
export { FieldType } from "./fields"

// Ре-экспорт чистых функций из fields
export {
  validateData,
  buildHeap,
  compileFlattenedEnsemble,
  findFieldOffset,
  packMeta,
  unpackMeta,
  compileEnsemble,
  compileFlattenedSuperposition,
  compileSuperposition,
  compileParsedConditions,
  encodeValue,
  encodeFieldValue,
  fieldTypeToBytecodeType,
  floatToUint,
  uintToFloat,
  createStoredStringInterner,
  createStringAtlasExport,
  materializeEntanglement,
  parseCondition,
  OP,
  TYPE,
} from "./fields"
