/**
 * @boundary/boundary — оркестратор конвейера GPU-эволюции суперпозиций.
 *
 * @packageDocumentation
 *
 * ## Конвейер данных
 *
 * Модуль реализует полный конвейер для выполнения FSM на GPU:
 *
 * 1. **validateData()** — валидация входных данных (чистая функция)
 * 2. **prepareData()** — кодирование, компиляция, построение heap (side effects)
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

import { getStringAtlas, resetStringAtlas } from "./atlas"
import { matrixInit, matrixReadChanges, matrixStep, matrixHeapUpdate, matrixStoreReset } from "./matrix"
import { boundary$ } from "./store"
import { fields$ } from "./fields/store"

// Импорт чистых функций из @boundary/fields
import {
  validateData,
  buildHeap,
  findFieldOffset,
  compileEnsemble,
  encodeFieldValue,
  encodeValue,
  fieldTypeToBytecodeType,
  findEntangledGroups,
  buildBraneMapping,
  TYPE,
  FieldType,
  type Data,
  type Field,
  type HeapInput,
  type CompiledRules,
  type EncodingContext,
} from "./fields"

// ============================================================================
// ТИПЫ
// ============================================================================

/**
 * Подготовленные данные для GPU.
 */
export interface PreparedData {
  fieldMeta: Map<number, { fieldType: number; fieldSize: number }>
  encodedEntangledFields: Map<string, [number, number][]>
  encodedLocalFields: [number, number][][]
  heapInput: HeapInput
  heapData: Uint32Array
  heapLayout: { blockPtrs: number[] }
  compiledRules: CompiledRules
  initialStates: Uint32Array
  /** Размер резервированной зоны для ARRAY аллокаций. */
  arrayReserveSize: number
}

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
  resetStringAtlas()
}

// ============================================================================
// ОРКЕСТРАТОР: prepareData()
// ============================================================================

/**
 * Этап 1: Подготовка данных (кодирование, компиляция, построение heap).
 *
 * @remarks
 * **Функция-оркестратор с side effects:**
 * - Вызывает `getStringAtlas().intern()` для строк (изменяет состояние атласа)
 * - Вызывает `compileEnsemble()` (интернирует строки из правил)
 *
 * **Не является чистой функцией** — имеет side effects через StringAtlas.
 *
 * @param data - Конфигурация полей и бран
 * @returns Подготовленные данные для GPU
 */
export function prepareData(data: Data): PreparedData {
  // Извлекаем values из бран для анализа entangled
  const branes = data.branes ?? []
  const fieldDefs = data.fields ?? []
  const values = branes.map((b) => b.values)

  // Анализ entangled групп (чистая функция)
  const entangledAnalysis = findEntangledGroups(values)

  // Создаём маппинг entangledBraneIds
  const entangledBraneIds = new Map<string, number>()
  let nextEntangledId = 0
  entangledAnalysis.entangledGroups.forEach((_, key) => {
    entangledBraneIds.set(key, nextEntangledId++)
  })

  // Построение маппинга бран (чистая функция)
  const braneMapping = buildBraneMapping(values, entangledBraneIds, entangledAnalysis)

  // Компиляция суперпозиций (чистая функция) — интернирует строки из IN списков
  const compiledRules = compileEnsemble(branes, fieldDefs)

  // Подготовка метаданных полей
  const fieldMeta = new Map<number, { fieldType: number; fieldSize: number }>()
  fieldDefs.forEach((field, idx) => {
    const fieldType = fieldTypeToBytecodeType(field.type)
    const fieldSize = fieldType === TYPE.STRING || fieldType === TYPE.ARRAY ? 2 : 1
    fieldMeta.set(idx, { fieldType, fieldSize })
  })

  // Кодирование entangled полей (принцип готового формата данных)
  const encodedEntangledFields = new Map<string, [number, number][]>()
  for (const [key, entangledFields] of braneMapping.entangledFields.entries()) {
    const encoded = entangledFields.map(([fieldIndex, value]) => {
      const meta = fieldMeta.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx: EncodingContext = { type: meta.fieldType }
      if (field?.enum !== undefined) {
        ctx.enum = field.enum
      }
      const encodedValue = encodeFieldValue(value, ctx)
      return [fieldIndex, encodedValue] as [number, number]
    })
    encodedEntangledFields.set(key, encoded)
  }

  // Кодирование local полей (принцип готового формата данных)
  const encodedLocalFields = braneMapping.localFields.map((braneFields) =>
    braneFields.map(([fieldIndex, value]) => {
      const meta = fieldMeta.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx: EncodingContext = { type: meta.fieldType }
      if (field?.enum !== undefined) {
        ctx.enum = field.enum
      }
      const encodedValue = encodeFieldValue(value, ctx)
      return [fieldIndex, encodedValue] as [number, number]
    }),
  )

  // Динамический расчёт резерва для ARRAY на основе входных данных
  // Формула: сумма максимальных размеров массивов для всех ARRAY_PTR полей
  // Минимальный резерв: 256 слов (1KB) для небольших массивов
  const MIN_ARRAY_RESERVE = 256
  let arrayReserve = MIN_ARRAY_RESERVE

  // Считаем потенциальный размер массивов из values
  for (const brane of branes) {
    for (const [fieldIndex, value] of brane.values) {
      const field = fieldDefs[fieldIndex]
      if (field?.type === FieldType.ARRAY_PTR && Array.isArray(value)) {
        // Размер массива в heap: 1 (длина) + элементы
        const arraySize = 1 + value.length
        if (arraySize > arrayReserve) {
          arrayReserve = arraySize
        }
      }
    }
  }

  // Добавляем буфер 2x для будущих update() операций
  arrayReserve *= 2

  // Построение heap с уже закодированными значениями
  const heapInput = {
    localFields: encodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: encodedEntangledFields,
    fieldMeta,
  }
  const heapLayout = buildHeap(heapInput)
  let heapData = heapLayout.heap

  // Расширяем heap с учётом резерва для ARRAY
  const actualHeapSize = heapData.length + arrayReserve
  const extendedHeap = new Uint32Array(actualHeapSize)
  extendedHeap.set(heapData)
  heapData = extendedHeap

  // Сохраняем размер резерва для использования в update()
  const arrayReserveSize = arrayReserve

  // Аллокация массивов из values (после создания extendedHeap)
  let heapAllocOffset = heapData.length - arrayReserveSize

  // Функция аллокации для encodeValue
  const allocateHeap = (size: number): number => {
    const ptr = heapAllocOffset
    heapAllocOffset += size
    return ptr
  }

  // Перекодируем local поля с ARRAY (теперь с allocateHeap)
  const finalEncodedLocalFields = braneMapping.localFields.map((braneFields) =>
    braneFields.map(([fieldIndex, value]) => {
      const meta = fieldMeta.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx: EncodingContext = {
        type: meta.fieldType,
        allocateHeap,
        heap: heapData,
      }
      if (field?.enum !== undefined) {
        ctx.enum = field.enum
      }
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
      const encodedValue = encodeValue(value, ctx)
      return [fieldIndex, encodedValue.value1] as [number, number]
    }),
  )

  // Обновляем heapInput с финальными закодированными полями
  const finalHeapInput = {
    localFields: finalEncodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: encodedEntangledFields,
    fieldMeta,
  }
  const finalHeapLayout = buildHeap(finalHeapInput)
  heapData.set(finalHeapLayout.heap)

  // Перекодируем entangled поля с ARRAY (теперь с allocateHeap)
  const finalEncodedEntangledFields = new Map<string, [number, number][]>()
  for (const [key, entangledFields] of braneMapping.entangledFields.entries()) {
    const encoded = entangledFields.map(([fieldIndex, value]) => {
      const meta = fieldMeta.get(fieldIndex)!
      const field = fieldDefs[fieldIndex]
      const ctx: EncodingContext = {
        type: meta.fieldType,
        allocateHeap,
        heap: heapData,
      }
      if (field?.enum !== undefined) {
        ctx.enum = field.enum
      }
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
      const encodedValue = encodeValue(value, ctx)
      return [fieldIndex, encodedValue.value1] as [number, number]
    })
    finalEncodedEntangledFields.set(key, encoded)
  }

  // Финальное построение heap с entangled ARRAY
  const ultimateHeapInput = {
    localFields: finalEncodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: finalEncodedEntangledFields,
    fieldMeta,
  }
  const ultimateHeapLayout = buildHeap(ultimateHeapInput)
  heapData.set(ultimateHeapLayout.heap)

  // Начальные состояния
  const initialStates = new Uint32Array(branes.map((b) => b.state))

  return {
    fieldMeta,
    encodedEntangledFields: finalEncodedEntangledFields,
    encodedLocalFields: finalEncodedLocalFields,
    heapInput: ultimateHeapInput,
    heapData,
    heapLayout: ultimateHeapLayout,
    compiledRules,
    initialStates,
    arrayReserveSize,
  }
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
  const atlas = getStringAtlas()
  const atlasExport = atlas.exportData()

  return {
    heap: commonState.heap,
    bytecode: commonState.bytecode,
    bytecodeOffsets: commonState.bytecodeOffsets,
    states: commonState.initialStates,
    stringRegistry: atlasExport.registry,
    stringHeap: atlasExport.heap,
    fields: localState.fields,
    metadata: {
      arrayReserveSize: localState.arrayReserveSize,
      heapAllocOffset: localState.heapAllocOffset,
      braneBlockPtrs: commonState.braneBlockPtrs,
    },
  }
}

// ============================================================================
// ОСНОВНОЕ API: write()
// ============================================================================

/**
 * Инициализирует матрицу (загружает данные на GPU) и возвращает начальные состояния.
 *
 * @remarks
 * **Side Effects:**
 * - Сбрасывает StringAtlas
 * - Аллоцирует GPU-буферы
 * - НЕ выполняет step() во время инициализации
 * - Возвращает изменения после инициализации (обычно пусто до первого update())
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
 * const initialStates = await write({
 *   fields: [{ type: FieldType.F32 }],
 *   branes: [{ values: [[0, 100]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null]] }],
 * })
 * // initialStates = [] до первого update()
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
    resetStringAtlas()
    matrixStoreReset()

    // 2. Подготовка данных (с side effects для интернирования строк)
    const prepared = prepareData(data)

    // 3. Сохраняем локальное состояние (@boundary/fields/store)
    fields$.restore({
      fields: data.fields ?? [],
      heapAllocOffset: prepared.heapData.length - prepared.arrayReserveSize,
      arrayReserveSize: prepared.arrayReserveSize,
      arrayDataInvalidated: false,
    })

    // 4. Сохраняем общее состояние (@boundary/boundary/store)
    boundary$.restore({
      bytecode: prepared.compiledRules.bytecode,
      bytecodeOffsets: prepared.compiledRules.bytecodeOffsets,
      initialStates: prepared.initialStates,
      heap: prepared.heapData,
      braneBlockPtrs: prepared.heapLayout.blockPtrs,
    })

    // 5. Инициализация GPU с инъекцией store$
    const atlasExport = getStringAtlas().exportData()
    await matrixInit(
      boundary$,
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

    // 6. Во время инициализации шаг FSM не выполняется

    // 7. Возвращаем состояния после инициализации
    return await matrixReadChanges()
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
    if (!commonState.heap) {
      throw new Error("Matrix not initialized. Call write() first.")
    }

    const localState = fields$
    if (!localState.fields.length) {
      throw new Error("Store not initialized. Call write() first.")
    }

    const { heap, braneBlockPtrs } = commonState
    const { fields, heapAllocOffset } = localState

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
        const encoded = encodeFieldUpdate(value, field, heap, heapAllocOffset)
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
    matrixHeapUpdate(allHeapUpdates)

    // Этап 3: GPU step + read
    matrixStep()
    return await matrixReadChanges()
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
 * @example
 * ```typescript
 * // Снять блокировку с бран 0, 1, 2
 * unlock([0, 1, 2])
 * ```
 */
export function unlock(indexes: number[]): void {
  const commonState = boundary$
  const { braneBlockPtrs } = commonState

  const unlockUpdates = indexes.map((index) => {
    const blockPtr = braneBlockPtrs[index]
    if (blockPtr === undefined) {
      throw new Error(`Brane at index ${index} not found in boundary`)
    }
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
export type { Field, Data, Brane, Collapse, BraneValue, FieldTypeValue } from "./fields"
export { FieldType } from "./fields"

// Ре-экспорт чистых функций из fields
export {
  validateData,
  buildHeap,
  findFieldOffset,
  packMeta,
  unpackMeta,
  compileEnsemble,
  compileSuperposition,
  compileParsedConditions,
  encodeValue,
  encodeFieldValue,
  fieldTypeToBytecodeType,
  floatToUint,
  uintToFloat,
  findEntangledGroups,
  buildBraneMapping,
  parseCondition,
  OP,
  TYPE,
} from "./fields"
