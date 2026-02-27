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
import { encodeValue, encodeValueWithPair, fieldTypeToBytecodeType } from "./params"
import type { EncodingContext } from "./params.t"
import type { Data, Brane, Field } from "./index.t"
import { TYPE } from "./opcodes"

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ МОДУЛЯ (fp.md — явное состояние, не класс)
// ============================================================================
let backend: GPUBackend | null = null
let heap: Uint32Array | null = null
let fields: Field[] = []
let braneBlockPtrs: number[] = []
let bytecodeOffsets: Uint32Array | null = null
let braneCount: number = 0
let initialStates: Uint32Array | null = null
let heapAllocOffset: number = 0  // Для динамических аллокаций (ARRAY)

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
}

// ============================================================================
// ЭКСПОРТ: 2 ФУНКЦИИ
// ============================================================================
/**
 * Подготовленные данные для GPU.
 */
interface PreparedData {
  fieldTypes: Map<number, number>
  fieldMeta: Map<number, { fieldType: number; fieldSize: number }>
  encodedEntangledFields: Map<string, [number, number][]>
  encodedLocalFields: [number, number][][]
  heapInput: HeapInput
  heapData: Uint32Array
  heapLayout: { blockPtrs: number[] }
  compiledRules: CompiledRules
  initialStates: Uint32Array
}

/**
 * Этап 1: Подготовка данных (кодирование, компиляция).
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects.
 *
 * @param data - Конфигурация полей и бран
 * @returns Подготовленные данные для GPU
 */
function prepareData(data: Data): PreparedData {
  // Сброс StringAtlas ПЕРЕД компиляцией
  resetStringAtlas()

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
  const fieldTypes = new Map<number, number>()
  const fieldMeta = new Map<number, { fieldType: number; fieldSize: number }>()
  data.fields.forEach((field, idx) => {
    const fieldType = fieldTypeToBytecodeType(field.type)
    fieldTypes.set(idx, fieldType)
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
    fieldTypes,
    fieldMeta,
  }
  const heapLayout = buildHeap(heapInput)
  let heapData = heapLayout.heap

  // Резервируем место в конце heap для динамических аллокаций (ARRAY)
  // Оставляем 1024 слова для ARRAY данных
  const arrayReserve = 1024
  const actualHeapSize = heapData.length + arrayReserve
  const extendedHeap = new Uint32Array(actualHeapSize)
  extendedHeap.set(heapData)
  heapData = extendedHeap

  // Начальные состояния
  const initialStates = new Uint32Array(data.branes.map((b) => b.state))

  return {
    fieldTypes,
    fieldMeta,
    encodedEntangledFields,
    encodedLocalFields,
    heapInput,
    heapData,
    heapLayout,
    compiledRules,
    initialStates,
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
 * @param data - Конфигурация полей и бран
 */
export async function write(data: Data): Promise<void> {
  // 0. Сброс предыдущего состояния (если есть)
  if (backend) {
    backend.clear()
  }
  resetMatrix()

  // Этап 1: Подготовка данных
  const prepared = prepareData(data)

  // Сохраняем глобальное состояние
  fields = data.fields
  braneCount = data.branes.length
  bytecodeOffsets = prepared.compiledRules.bytecodeOffsets
  heap = prepared.heapData
  heapAllocOffset = heap.length - 1024  // Начало зоны для ARRAY
  braneBlockPtrs = prepared.heapLayout.blockPtrs
  initialStates = prepared.initialStates

  // Этап 2: Инициализация GPU
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
}

/**
 * Обновляет поле браны и возвращает новые состояния.
 *
 * @remarks
 * **Side Effects:**
 * - Обновляет heap
 * - Выполняет step() автоматически
 * - Читает состояния из GPU
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
  if (!backend || !heap || !initialStates) {
    throw new Error("Matrix not initialized. Call write() first.")
  }

  if (braneIndex < 0 || braneIndex >= braneCount) {
    throw new Error(`Brane index out of range: ${braneIndex}`)
  }

  // 1. Находим смещение поля в heap
  const blockPtr = braneBlockPtrs[braneIndex]!
  const fieldOffset = findFieldOffsetInHeap(heap, blockPtr, fieldIndex)

  if (fieldOffset === null) {
    throw new Error(`Field ${fieldIndex} not found in brane ${braneIndex}`)
  }

  // 2. Кодируем значение
  const field = fields[fieldIndex]
  if (!field) {
    throw new Error(`Field ${fieldIndex} not defined`)
  }

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

  let encodedValue: number
  let encodedValue2: number = 0  // Для STRING (hash) и ARRAY (reserved)

  // Для STRING — интернируем и получаем hash
  if (fieldType === TYPE.STRING && typeof value === 'string') {
    const { value1, value2 } = encodeValueWithPair(value, context)
    encodedValue = value1
    encodedValue2 = value2
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
      heap[heapAllocOffset + 1 + i] = encodeValue(arr[i], itemCtx)
    }
    encodedValue = heapAllocOffset  // pointer to array data
    encodedValue2 = 0  // reserved
    heapAllocOffset += arraySize
  } else {
    encodedValue = encodeValue(value, context)
  }

  // 3. Обновляем heap
  writeValueToHeap(heap, fieldOffset, fieldType, encodedValue, encodedValue2)

  // 4. Отправляем обновлённый heap на GPU
  backend.updateHeap(heap)

  // 5. Автоматический step
  backend.run()

  // 6. Читаем состояния
  const states = await backend.read()

  // 7. Возвращаем [[braneIndex, state], ...]
  return Array.from(states).map((state, idx) => [idx, state])
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
  
  // Для STRING и ARRAY используем encodeValueWithPair
  if (fieldType === TYPE.STRING || fieldType === TYPE.ARRAY) {
    const { value1 } = encodeValueWithPair(value, ctx)
    return value1
  }
  
  // Для скаляров используем encodeValue
  return encodeValue(value, ctx)
}
