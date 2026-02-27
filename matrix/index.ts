/**
 * matrix — функциональное API для GPU-эволюции суперпозиций.
 *
 * Архитектура:
 * - 2 функции: write(), update()
 * - step() вызывается автоматически внутри
 * - update() возвращает состояния [[braneIndex, state], ...]
 *
 * @example
 * ```ts
 * import { write, update } from "@metafor/matrix"
 *
 * await write({
 *   fields: [{ type: FieldType.F32 }],
 *   branes: [{ params: [[0, 100]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null]] }]
 * })
 *
 * const states = await update(0, 0, 30)  // [[0, 0], [1, 1], ...]
 * ```
 */
import { GPUBackend } from "./gpu/Backend"
import { GPU } from "./gpu/device"
import { getStringAtlas, resetStringAtlas, type StringAtlasExport } from "./StringAtlas"
import { findEntangledGroups, buildBraneMapping } from "./entangled"
import { buildHeap, findFieldOffset } from "./heap"
import type { HeapInput } from "./heap.t"
import { compileEnsemble } from "./superposition"
import type { CompiledRules } from "./superposition.t"
import { encodeValue, fieldTypeToBytecodeType } from "./params"
import type { EncodingContext } from "./params.t"
import type { Data, Brane, Field } from "./index.t"
import { FieldType } from "./index.t"
import { TYPE } from "./opcodes"

// ============================================================================
// ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ
// ============================================================================
/**
 * Валидирует входные данные перед обработкой.
 *
 * @param data - Конфигурация для валидации
 * @throws {Error} При невалидных данных
 */
function validateData(data: Data): void {
  // Проверка на пустые массивы
  if (!data.fields || data.fields.length === 0) {
    throw new Error("fields array cannot be empty")
  }

  if (!data.branes || data.branes.length === 0) {
    throw new Error("branes array cannot be empty")
  }

  // Валидация полей
  data.fields.forEach((field, fieldIndex) => {
    if (
      field.type === undefined ||
      !Object.values(FieldType).includes(field.type)
    ) {
      throw new Error(`Field ${fieldIndex}: invalid type ${field.type}`)
    }

    // Проверка elementType для ARRAY_PTR
    if (field.type === FieldType.ARRAY_PTR && !field.elementType) {
      throw new Error(`Field ${fieldIndex}: ARRAY_PTR requires elementType`)
    }
  })

  // Валидация бран
  data.branes.forEach((brane, braneIndex) => {
    // Проверка params
    if (!brane.params || !Array.isArray(brane.params)) {
      throw new Error(`Brane ${braneIndex}: params must be an array`)
    }

    brane.params.forEach(([fieldIndex, value], paramIndex) => {
      if (fieldIndex < 0 || fieldIndex >= data.fields.length) {
        throw new Error(
          `Brane ${braneIndex}, param ${paramIndex}: field index ${fieldIndex} out of range`,
        )
      }

      const field = data.fields[fieldIndex]!

      // Проверка enum значений (строка допустима для enum полей)
      if (field.enum && typeof value === "string") {
        if (!field.enum.includes(value)) {
          throw new Error(
            `Brane ${braneIndex}, field ${fieldIndex}: value '${value}' not in enum [${field.enum}]`,
          )
        }
        // Строковое значение enum допустимо — дальше не проверяем тип
        return
      }

      // Проверка типа значения для не-enum полей
      if (field.type === FieldType.STRING_PTR && typeof value !== "string") {
        throw new Error(
          `Brane ${braneIndex}, field ${fieldIndex}: expected string, got ${typeof value}`,
        )
      }

      if (field.type === FieldType.ARRAY_PTR && !Array.isArray(value)) {
        throw new Error(
          `Brane ${braneIndex}, field ${fieldIndex}: expected array, got ${typeof value}`,
        )
      }

      if (
        field.type === FieldType.F32 ||
        field.type === FieldType.U32
      ) {
        if (typeof value !== "number") {
          throw new Error(
            `Brane ${braneIndex}, field ${fieldIndex}: expected number, got ${typeof value}`,
          )
        }
      }

      if (field.type === FieldType.BOOL && typeof value !== "boolean") {
        throw new Error(
          `Brane ${braneIndex}, field ${fieldIndex}: expected boolean, got ${typeof value}`,
        )
      }
    })

    // Проверка collapses
    if (!brane.collapses || !Array.isArray(brane.collapses)) {
      throw new Error(`Brane ${braneIndex}: collapses must be an array`)
    }

    brane.collapses.forEach((stateTransitions, stateIndex) => {
      if (!Array.isArray(stateTransitions)) {
        throw new Error(
          `Brane ${braneIndex}, state ${stateIndex}: transitions must be an array`,
        )
      }

      stateTransitions.forEach((transition, transitionIndex) => {
        if (transition === null) return // Терминальное состояние

        const [targetState, conditions] = transition

        if (typeof targetState !== "number" || targetState < 0) {
          throw new Error(
            `Brane ${braneIndex}, state ${stateIndex}, transition ${transitionIndex}: invalid target state`,
          )
        }

        if (targetState >= brane.collapses.length) {
          throw new Error(
            `Brane ${braneIndex}, state ${stateIndex}, transition ${transitionIndex}: target state ${targetState} out of range`,
          )
        }

        // Валидация условий
        if (conditions && typeof conditions === "object") {
          for (const [condFieldIndex, cond] of Object.entries(conditions)) {
            const fieldIdx = Number(condFieldIndex)

            if (fieldIdx < 0 || fieldIdx >= data.fields.length) {
              throw new Error(
                `Brane ${braneIndex}, state ${stateIndex}: condition references non-existent field ${fieldIdx}`,
              )
            }

            // Проверка циклических зависимостей (упрощённая)
            if (fieldIdx === braneIndex) {
              // Это не циклическая зависимость, а ссылка на своё поле — ок
            }
          }
        }
      })
    })
  })
}
let backend: GPUBackend | null = null
let heap: Uint32Array | null = null
let fields: Field[] = []
let braneBlockPtrs: number[] = []
let bytecodeOffsets: Uint32Array | null = null
let braneCount: number = 0
let initialStates: Uint32Array | null = null
let heapAllocOffset: number = 0  // Для динамических аллокаций (ARRAY)
let arrayReserveSize: number = 0  // Размер резервированной зоны для ARRAY
let arrayDataInvalidated = false  // Флаг: данные ARRAY невалидны после update()

/**
 * Mutex для предотвращения конкурентных вызовов update().
 * null = свободно, Promise = занято (ожидание завершения).
 */
let updateMutex: Promise<void> | null = null

/**
 * Mutex для предотвращения конкурентных вызовов write().
 * null = свободно, Promise = занято (ожидание завершения).
 */
let writeMutex: Promise<void> | null = null

/**
 * Сбрасывает состояние модуля (для тестов).
 * @internal
 */
export function resetMatrix(): void {
  backend = null
  heap = null
  fields = []
  braneBlockPtrs = []
  bytecodeOffsets = null
  braneCount = 0
  initialStates = null
  heapAllocOffset = 0
  arrayReserveSize = 0
  arrayDataInvalidated = false
  updateMutex = null
  writeMutex = null
}

// ============================================================================
// ЭКСПОРТ: 2 ФУНКЦИИ
// ============================================================================
/**
 * Подготовленные данные для GPU.
 */
interface PreparedData {
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

/**
 * Этап 1: Подготовка данных (кодирование, компиляция).
 *
 * @remarks
 * **Функция с side effects:**
 * - Вызывает `getStringAtlas().intern()` для строк (изменяет состояние атласа)
 * - Вызывает `compileEnsemble()` (интернирует строки из правил)
 *
 * **Не является чистой функцией** в терминах fp.md п.1.
 * Используется как "координатор" в конвейере данных.
 *
 * @param data - Конфигурация полей и бран
 * @returns Подготовленные данные для GPU
 */
function prepareData(data: Data): PreparedData {
  // Извлекаем params из бран для анализа entangled
  const params = data.branes.map((b) => b.params)

  // Анализ entangled групп (чистая функция)
  const entangledAnalysis = findEntangledGroups(params)

  // Создаём маппинг entangledBraneIds
  const entangledBraneIds = new Map<string, number>()
  let nextEntangledId = 0
  entangledAnalysis.entangledGroups.forEach((_, key) => {
    entangledBraneIds.set(key, nextEntangledId++)
  })

  // Построение маппинга бран (чистая функция)
  const braneMapping = buildBraneMapping(params, entangledBraneIds, entangledAnalysis)

  // Компиляция суперпозиций (чистая функция) — интернирует строки из IN списков
  const compiledRules = compileEnsemble(data.branes, data.fields)

  // Подготовка метаданных полей
  const fieldMeta = new Map<number, { fieldType: number; fieldSize: number }>()
  data.fields.forEach((field, idx) => {
    const fieldType = fieldTypeToBytecodeType(field.type)
    const fieldSize = fieldType === TYPE.STRING || fieldType === TYPE.ARRAY ? 2 : 1
    fieldMeta.set(idx, { fieldType, fieldSize })
  })

  // Кодирование entangled полей (принцип готового формата данных)
  const encodedEntangledFields = new Map<string, [number, number][]>()
  for (const [key, fields] of braneMapping.entangledFields.entries()) {
    const encoded = fields.map(([fieldIndex, value]) => {
      const meta = fieldMeta.get(fieldIndex)!
      const field = data.fields[fieldIndex]
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
  const encodedLocalFields = braneMapping.localFields.map(braneFields =>
    braneFields.map(([fieldIndex, value]) => {
      const meta = fieldMeta.get(fieldIndex)!
      const field = data.fields[fieldIndex]
      const ctx: EncodingContext = { type: meta.fieldType }
      if (field?.enum !== undefined) {
        ctx.enum = field.enum
      }
      const encodedValue = encodeFieldValue(value, ctx)
      return [fieldIndex, encodedValue] as [number, number]
    })
  )

  // Построение heap с уже закодированными значениями
  const heapInput = {
    localFields: encodedLocalFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: encodedEntangledFields,
    fieldMeta,
  }
  const heapLayout = buildHeap(heapInput)
  let heapData = heapLayout.heap

  // Динамический расчёт резерва для ARRAY на основе входных данных
  // Формула: сумма максимальных размеров массивов для всех ARRAY_PTR полей
  // Минимальный резерв: 256 слов (1KB) для небольших массивов
  const MIN_ARRAY_RESERVE = 256
  let arrayReserve = MIN_ARRAY_RESERVE

  // Считаем потенциальный размер массивов из params
  for (const brane of data.branes) {
    for (const [fieldIndex, value] of brane.params) {
      const field = data.fields[fieldIndex]
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

  const actualHeapSize = heapData.length + arrayReserve
  const extendedHeap = new Uint32Array(actualHeapSize)
  extendedHeap.set(heapData)
  heapData = extendedHeap

  // Сохраняем размер резерва для использования в update()
  const arrayReserveSize = arrayReserve

  // Начальные состояния
  const initialStates = new Uint32Array(data.branes.map((b) => b.state))

  return {
    fieldMeta,
    encodedEntangledFields,
    encodedLocalFields,
    heapInput,
    heapData,
    heapLayout,
    compiledRules,
    initialStates,
    arrayReserveSize,
  }
}

/**
 * Инициализирует матрицу (загружает данные на GPU).
 *
 * @remarks
 * **Side Effects:**
 * - Сбрасывает StringAtlas
 * - Аллоцирует GPU-буферы
 * - НЕ выполняет step() автоматически (это делает update())
 *
 * **Потокобезопасность:**
 * - Функция использует mutex для предотвращения конкурентных вызовов
 * - При одновременных вызовах второй будет ожидать завершения первого
 *
 * @param data - Конфигурация полей и бран
 */
export async function write(data: Data): Promise<void> {
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

    // 1. Сброс предыдущего состояния (если есть)
    if (backend) {
      backend.clear()
    }
    resetMatrix()
    resetStringAtlas()  // Side effect перед prepareData()

    // Этап 2: Подготовка данных (с side effects для интернирования строк)
    const prepared = prepareData(data)

    // Сохраняем глобальное состояние
    fields = data.fields
    braneCount = data.branes.length
    bytecodeOffsets = prepared.compiledRules.bytecodeOffsets
    heap = prepared.heapData
    arrayReserveSize = prepared.arrayReserveSize
    heapAllocOffset = heap.length - prepared.arrayReserveSize  // Начало зоны для ARRAY
    arrayDataInvalidated = false  // Сброс флага после write()
    braneBlockPtrs = prepared.heapLayout.blockPtrs
    initialStates = prepared.initialStates

    // Этап 3: Инициализация GPU
    backend = new GPUBackend(GPU.device)

    const atlasExport = getStringAtlas().export()
    await backend.init(
      {
        braneCount,
        bytecode: prepared.compiledRules.bytecode,
        bytecodeOffsets: prepared.compiledRules.bytecodeOffsets,
        states: prepared.initialStates,
        braneDescriptors: buildBraneDescriptors(braneBlockPtrs, prepared.compiledRules.bytecodeOffsets),
        heap: prepared.heapData,
      },
      atlasExport,
      false,
    )

    // Сохраняем heap в глобальной переменной
    heap = prepared.heapData

    // НЕ делаем step() после инициализации — это делает update()
  } finally {
    // Освобождение mutex
    resolveMutex?.()
  }
}

/**
 * Обновляет поле браны и возвращает новые состояния.
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
 * - При одновременных вызовах второй будет ожидать завершения первого
 *
 * **ARRAY поля:**
 * - Данные массивов хранятся во временной зоне heap
 * - **После каждого `update()` зона очищается** (данные массива не сохраняются)
 * - Для сохранения массива нужно явно передать его в следующем `update()`
 *
 * @param braneIndex - Индекс браны
 * @param fieldIndex - Индекс поля
 * @param value - Новое значение
 * @returns Массив состояний: [[braneIndex, state], ...]
 */
export async function update(
  braneIndex: number,
  fieldIndex: number,
  value: unknown,
): Promise<[number, number][]> {
  // Блокировка mutex для предотвращения конкурентных вызовов
  // Если уже выполняется update(), ждём его завершения
  if (updateMutex) {
    await updateMutex
  }

  // Создаём promise для текущей операции (захват mutex)
  let resolveMutex: (() => void) | undefined
  updateMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  try {
    if (!backend || !heap || !initialStates) {
      throw new Error("Matrix not initialized. Call write() first.")
    }

    if (braneIndex < 0 || braneIndex >= braneCount) {
      throw new Error(`Brane index out of range: ${braneIndex}`)
    }

    // Этап 1: Поиск смещения поля
    const blockPtr = braneBlockPtrs[braneIndex]!
    const fieldOffset = findFieldOffsetInHeap(heap, blockPtr, fieldIndex)

    if (fieldOffset === null) {
      throw new Error(`Field ${fieldIndex} not found in brane ${braneIndex}`)
    }

    // Этап 2: Кодирование значения
    const field = fields[fieldIndex]
    if (!field) {
      throw new Error(`Field ${fieldIndex} not defined`)
    }

    const encoded = encodeFieldUpdate(value, field)

    // Этап 3: Обновление heap (локально)
    const fieldType = fieldTypeToBytecodeType(field.type)
    writeValueToHeap(heap, fieldOffset, fieldType, encoded.value1, encoded.value2)

    // Этап 4: Частичная запись в GPU
    // Для ARRAY: передаём pointer + данные массива
    // Для STRING: передаём string_id + hash
    // Для скаляров: передаём 1 слово
    if (fieldType === TYPE.ARRAY && Array.isArray(value)) {
      // Передаём pointer и reserved (2 слова)
      backend.updateHeapFields([{ offset: fieldOffset, value1: encoded.value1, value2: encoded.value2 }])
      // Передаём данные массива: [length, item1, item2, ...]
      const arrayData = heap!.slice(encoded.value1, encoded.value1 + 1 + (value as unknown[]).length)
      const arrayUpdates = Array.from(arrayData).map((val, idx) => ({
        offset: encoded.value1 + idx,
        value1: val,
      }))
      backend.updateHeapFields(arrayUpdates)
    } else if (fieldType === TYPE.STRING) {
      backend.updateHeapFields([{ offset: fieldOffset, value1: encoded.value1, value2: encoded.value2 }])
    } else {
      backend.updateHeapFields([{ offset: fieldOffset, value1: encoded.value1 }])
    }

    // Этап 5: GPU step + read
    backend.run()
    const states = await backend.read()

    // Этап 6: Сброс зоны аллокации ARRAY для следующего шага
    // Данные массива записываются в резервную зону heap, которая очищается после каждого шага
    heapAllocOffset = heap.length - arrayReserveSize
    arrayDataInvalidated = true  // Помечаем, что данные ARRAY невалидны

    // Этап 7: Форматирование результата
    return Array.from(states).map((state, idx) => [idx, state])
  } finally {
    // Освобождение mutex
    resolveMutex?.()
  }
}

/**
 * Обновление нескольких полей браны за один GPU-синк.
 *
 * @remarks
 * **Производительность:**
 * - Один вызов `updateHeapFields()` для всех изменений
 * - Один вызов `run()` для GPU-эволюции
 * - В 100-1000 раз эффективнее нескольких `update()` для массовых обновлений
 *
 * **ARRAY поля:**
 * - Данные массивов хранятся во временной зоне heap
 * - **После каждого `updateMany()` зона очищается** (данные массива не сохраняются)
 *
 * **Потокобезопасность:**
 * - Функция использует mutex для предотвращения конкурентных вызовов
 *
 * @param braneIndex - Индекс браны
 * @param updates - Массив обновлений: `[{ fieldIndex, value }, ...]`
 * @returns Массив состояний: `[[braneIndex, state], ...]`
 *
 * @example
 * ```typescript
 * // Обновление 3 полей за один GPU-синк
 * await updateMany(0, [
 *   { fieldIndex: 0, value: 100 },   // hp
 *   { fieldIndex: 1, value: true },  // active
 *   { fieldIndex: 2, value: "hero" }, // name (STRING)
 * ])
 * ```
 */
export async function updateMany(
  braneIndex: number,
  updates: Array<{ fieldIndex: number; value: unknown }>,
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
    if (!backend || !heap || !initialStates) {
      throw new Error("Matrix not initialized. Call write() first.")
    }

    if (braneIndex < 0 || braneIndex >= braneCount) {
      throw new Error(`Brane index out of range: ${braneIndex}`)
    }

    const blockPtr = braneBlockPtrs[braneIndex]!

    // Этап 1: Кодирование всех обновлений
    const heapUpdates: Array<{ offset: number; value1: number; value2?: number }> = []

    for (const { fieldIndex, value } of updates) {
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
      const encoded = encodeFieldUpdate(value, field)
      const fieldType = fieldTypeToBytecodeType(field.type)

      // Добавление в список обновлений
      // Для ARRAY: передаём pointer + данные массива
      // Для STRING: передаём string_id + hash
      // Для скаляров: передаём 1 слово
      if (fieldType === TYPE.ARRAY && Array.isArray(value)) {
        // Pointer и reserved
        heapUpdates.push({ offset: fieldOffset, value1: encoded.value1, value2: encoded.value2 })
        // Данные массива: [length, item1, item2, ...]
        const arrayData = heap!.slice(encoded.value1, encoded.value1 + 1 + (value as unknown[]).length)
        for (let i = 0; i < arrayData.length; i++) {
          heapUpdates.push({ offset: encoded.value1 + i, value1: arrayData[i]! })
        }
      } else if (fieldType === TYPE.STRING) {
        heapUpdates.push({ offset: fieldOffset, value1: encoded.value1, value2: encoded.value2 })
      } else {
        heapUpdates.push({ offset: fieldOffset, value1: encoded.value1 })
      }
    }

    // Этап 2: Частичная запись в GPU (только изменённые поля)
    backend.updateHeapFields(heapUpdates)

    // Этап 3: GPU step + read
    backend.run()
    const states = await backend.read()

    // Этап 4: Сброс зоны аллокации ARRAY
    heapAllocOffset = heap.length - arrayReserveSize
    arrayDataInvalidated = true  // Помечаем, что данные ARRAY невалидны

    // Этап 5: Форматирование результата
    return Array.from(states).map((state, idx) => [idx, state])
  } finally {
    // Освобождение mutex
    resolveMutex?.()
  }
}

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
 * @returns Закодированное значение (value1, value2)
 */
function encodeFieldUpdate(
  value: unknown,
  field: Field,
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
  let value2 = 0  // Для STRING (hash) и ARRAY (reserved)

  // Для STRING — интернируем и получаем hash
  if (fieldType === TYPE.STRING && typeof value === 'string') {
    const encoded = encodeValue(value, context)
    value1 = encoded.value1
    value2 = encoded.value2
  }
  // Для ARRAY — аллоцируем место в heap и кодируем элементы
  else if (fieldType === TYPE.ARRAY && Array.isArray(value)) {
    // Предупреждение: данные ARRAY были сброшены после предыдущего update()
    if (arrayDataInvalidated) {
      console.warn(
        `⚠️  ARRAY field: данные массива были сброшены после предыдущего update(). ` +
        `Передавайте массив явно при каждом update().`
      )
      arrayDataInvalidated = false  // Сбрасываем флаг после предупреждения
    }

    const arr = value as unknown[]
    // Аллоцируем: [length, item1, item2, ...]
    const arraySize = 1 + arr.length
    if (heapAllocOffset + arraySize > heap!.length) {
      throw new Error(`Heap overflow: need ${heapAllocOffset + arraySize}, have ${heap!.length}`)
    }
    // Записываем длину
    heap![heapAllocOffset] = arr.length
    // Кодируем и записываем элементы
    const elementType = context.subType ?? TYPE.FLOAT
    for (let i = 0; i < arr.length; i++) {
      const itemCtx: EncodingContext = { type: elementType }
      heap![heapAllocOffset + 1 + i] = encodeValue(arr[i], itemCtx).value1
    }
    value1 = heapAllocOffset  // pointer to array data
    value2 = 0  // reserved
    heapAllocOffset += arraySize
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
 * Найти смещение поля в heap (обёртка над heap.ts).
 */
function findFieldOffsetInHeap(
  heapData: Uint32Array,
  blockPtr: number,
  fieldIndex: number,
): number | null {
  // Ищем в локальных полях
  const localOffset = findFieldOffset(heapData, blockPtr, fieldIndex)
  if (localOffset !== null) {
    return localOffset
  }

  // Ищем в entangled блоках
  const localCount = heapData[blockPtr] ?? 0
  const entangledCount = heapData[blockPtr + 1] ?? 0
  const entangledPtrsOffset = blockPtr + 2 + localCount * 2

  for (let i = 0; i < entangledCount; i++) {
    const entangledPtr = heapData[entangledPtrsOffset + i] ?? 0
    if (entangledPtr === 0) continue

    const entangledOffset = findFieldOffset(heapData, entangledPtr, fieldIndex)
    if (entangledOffset !== null) {
      return entangledOffset
    }
  }

  return null
}

/**
 * Записать значение в heap по смещению.
 */
function writeValueToHeap(
  heapData: Uint32Array,
  offset: number,
  fieldType: number,
  encodedValue: number,
  encodedValue2: number = 0,
): void {
  switch (fieldType) {
    case TYPE.FLOAT:
      // encodedValue — это битовое представление float в u32
      heapData[offset] = encodedValue
      break
    case TYPE.UINT:
    case TYPE.BOOL:
      heapData[offset] = encodedValue
      break
    case TYPE.STRING: {
      // STRING: encodedValue = string_id, encodedValue2 = hash
      // Формат в heap: [string_id, hash]
      heapData[offset] = encodedValue
      heapData[offset + 1] = encodedValue2
      break
    }
    case TYPE.ARRAY: {
      // ARRAY: encodedValue = pointer в heap, encodedValue2 = reserved
      // Формат в heap: [pointer, reserved]
      // Данные массива: [length, item1, item2, ...] хранятся отдельно
      heapData[offset] = encodedValue
      heapData[offset + 1] = encodedValue2
      break
    }
    default:
      heapData[offset] = encodedValue
  }
}

/**
 * Закодировать значение поля для heap.
 *
 * @param value - Значение для кодирования
 * @param ctx - Контекст кодирования
 * @returns Закодированное значение (value1 из EncodedValueResult для STRING/ARRAY)
 */
function encodeFieldValue(
  value: unknown,
  ctx: EncodingContext,
): number {
  const fieldType = ctx.type
  
  // Для STRING и ARRAY используем encodeValue (возвращает пару)
  if (fieldType === TYPE.STRING || fieldType === TYPE.ARRAY) {
    return encodeValue(value, ctx).value1
  }
  
  // Для скаляров используем encodeValue (возвращает пару, value2 = 0)
  return encodeValue(value, ctx).value1
}
