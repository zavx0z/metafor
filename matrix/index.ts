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
import { compileEnsemble } from "./superposition"
import { encodeValue, fieldTypeToBytecodeType } from "./params"
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

  // 1. Сброс StringAtlas ПЕРЕД компиляцией
  resetStringAtlas()

  // 2. Сохраняем поля
  fields = data.fields
  braneCount = data.branes.length

  // 3. Извлекаем params из бран для анализа entangled
  const params = data.branes.map((b) => b.params)

  // 4. Анализ entangled групп (чистая функция)
  const entangledAnalysis = findEntangledGroups(params)

  // 5. Создаём маппинг entangledBraneIds
  const entangledBraneIds = new Map<string, number>()
  let nextEntangledId = 0
  entangledAnalysis.entangledGroups.forEach((_, key) => {
    entangledBraneIds.set(key, nextEntangledId++)
  })

  // 6. Построение маппинга бран (чистая функция)
  const braneMapping = buildBraneMapping(params, entangledBraneIds, entangledAnalysis)

  // 7. Компиляция суперпозиций (чистая функция) — интернирует строки из IN списков
  const compiledRules = compileEnsemble(data.branes, fields)
  bytecodeOffsets = compiledRules.bytecodeOffsets

  // 8. Построение heap — интернирует строки из params
  const fieldTypes = new Map<number, number>()
  const fieldEnums = new Map<number, any[]>()
  fields.forEach((field, idx) => {
    fieldTypes.set(idx, fieldTypeToBytecodeType(field.type))
    if (field.enum !== undefined) {
      fieldEnums.set(idx, field.enum)
    }
  })

  const heapInput = {
    localFields: braneMapping.localFields,
    braneEntangledMap: braneMapping.braneEntangledMap,
    entangledFields: braneMapping.entangledFields,
    fieldTypes,
    fieldEnums,
  }
  const heapLayout = buildHeap(heapInput)
  let heapData = heapLayout.heap
  braneBlockPtrs = heapLayout.blockPtrs

  // Резервируем место в конце heap для динамических аллокаций (ARRAY)
  // Оставляем 1024 слова для ARRAY данных
  const arrayReserve = 1024
  const actualHeapSize = heapData.length + arrayReserve
  const extendedHeap = new Uint32Array(actualHeapSize)
  extendedHeap.set(heapData)
  heapData = extendedHeap
  heapAllocOffset = heapData.length - arrayReserve  // Начало зоны для ARRAY

  // 9. Начальные состояния
  initialStates = new Uint32Array(data.branes.map((b) => b.state))

  // 10. Инициализация GPU
  backend = new GPUBackend(GPU.device)

  const atlasExport = getStringAtlas().export()
  await backend.init(
    {
      braneCount,
      bytecode: compiledRules.bytecode,
      bytecodeOffsets: compiledRules.bytecodeOffsets,
      states: initialStates,
      braneDescriptors: buildBraneDescriptors(braneBlockPtrs, compiledRules.bytecodeOffsets),
      heap: heapData,
    },
    atlasExport,
    false,
  )

  // Сохраняем heap в глобальной переменной
  heap = heapData

  // 11. НЕ делаем step() после инициализации — это делает update()
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
    const atlas = getStringAtlas()
    const stringId = atlas.intern(value)
    const meta = atlas.getMeta(stringId)
    encodedValue = stringId
    encodedValue2 = meta ? meta.hash : 0
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
      const encodedItem = encodeValue(arr[i], itemCtx)
      heap[heapAllocOffset + 1 + i] = encodedItem
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
