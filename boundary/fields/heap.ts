/**
 * Построение heap и поиск полей.
 *
 * Формирует самоописываемые блоки бран с заголовком метаданных.
 * Каждый блок содержит:
 * - local_count: количество локальных полей
 * - entangled_count: количество ссылок на entangled блоки
 * - field_descriptors: [field_id, packed_meta] для каждого поля
 * - entangled_ptrs: указатели на entangled блоки
 * - values: значения полей
 *
 * @packageDocumentation
 */
import type { PackedMeta, FieldMeta, HeapBlock, HeapLayout, HeapInput } from "./heap.t"
import { TYPE } from "./opcodes"

/**
 * Константы для упаковки метаданных поля.
 * Формат: [8 бит: тип] [8 бит: размер] [16 бит: смещение]
 */
const META_TYPE_SHIFT = 24
const META_TYPE_MASK = 0xff
const META_SIZE_SHIFT = 16
const META_SIZE_MASK = 0xff
const META_OFFSET_MASK = 0xffff

/**
 * Упаковать метаданные поля в одно 32-битное слово.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects.
 *
 * Формат: [8 бит: тип] [8 бит: размер] [16 бит: смещение]
 *
 * @param fieldType - Тип поля (TYPE.FLOAT, TYPE.UINT, ...)
 * @param fieldSize - Размер в словах (1 для скаляров, 2 для указателей)
 * @param fieldOffset - Смещение значения в блоке (в словах)
 * @returns Упакованное значение u32
 *
 * @example
 * ```typescript
 * packMeta(TYPE.FLOAT, 1, 4) → 0x00010004
 * ```
 */
export function packMeta(fieldType: number, fieldSize: number, fieldOffset: number): PackedMeta {
  if (fieldType >= 256) throw new Error(`fieldType out of range: ${fieldType}`)
  if (fieldSize >= 256) throw new Error(`fieldSize out of range: ${fieldSize}`)
  if (fieldOffset >= 65536) throw new Error(`offset out of range: ${fieldOffset}`)
  return ((fieldType & META_TYPE_MASK) << META_TYPE_SHIFT) |
         ((fieldSize & META_SIZE_MASK) << META_SIZE_SHIFT) |
         (fieldOffset & META_OFFSET_MASK)
}

/**
 * Распаковать метаданные поля из u32.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects.
 *
 * @param packed - Упакованное значение
 * @returns Распакованные метаданные
 */
export function unpackMeta(packed: PackedMeta): FieldMeta {
  return {
    type: (packed >>> META_TYPE_SHIFT) & META_TYPE_MASK,
    size: (packed >>> META_SIZE_SHIFT) & META_SIZE_MASK,
    offset: packed & META_OFFSET_MASK,
  }
}

/**
 * Построить heap для ансамбля бран.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects, не зависит от состояния.
 *
 * Слово 0 резервируется как null pointer (аналогично boundary/).
 *
 * @param input - Входные данные: localFields, entangledFields, fieldTypes, fieldMeta
 * @returns HeapLayout с плоским heap и метаданными блоков
 *
 * @example
 * ```typescript
 * const layout = buildHeap({
 *   localFields: [[[0, 100], [1, true]]],
 *   braneEntangledMap: [[]],
 *   entangledFields: new Map(),
 *   fieldTypes: new Map([[0, TYPE.FLOAT], [1, TYPE.BOOL]]),
 *   fieldMeta: new Map([[0, { fieldType: TYPE.FLOAT, fieldSize: 1 }]]),
 * })
 * // layout.heap: Uint32Array с данными
 * // layout.blockPtrs: [8] (начинается после null pointer)
 * ```
 */
export function buildHeap(input: HeapInput): HeapLayout {
  const { localFields, braneEntangledMap, entangledFields, fieldMeta } = input

  // Собираем все блоки: сначала entangled, потом branes
  const allBlocks: [number, number][][] = []  // [fieldIndex, encodedValue]
  const entangledKeys = Array.from(entangledFields.keys())

  // Добавляем entangled блоки (уже закодированные)
  entangledKeys.forEach((key) => {
    allBlocks.push(entangledFields.get(key)!)
  })

  // Маппинг: entangled ключ → индекс блока в allBlocks
  const entangledKeyToIndex = new Map<string, number>()
  entangledKeys.forEach((key, idx) => {
    entangledKeyToIndex.set(key, idx)
  })

  // Добавляем brane блоки (уже закодированные)
  localFields.forEach((fields) => {
    allBlocks.push(fields)
  })

  // Рассчитываем размеры блоков и смещения
  // Слово 0 резервируется как null pointer
  const blockSizes: number[] = []
  const blockPtrs: number[] = []
  let currentPtr = 1  // Начинаем с 1, 0 = null

  // Сначала entangled блоки
  for (let i = 0; i < entangledKeys.length; i++) {
    const fields = entangledFields.get(entangledKeys[i]!)!
    const size = calculateBlockSizeEncoded(fields, fieldMeta, 0) // entangled_count = 0
    blockSizes.push(size)
    blockPtrs.push(currentPtr)
    currentPtr += size
  }

  // Потом brane блоки
  const braneBlockPtrs: number[] = []
  const braneBlockSizes: number[] = []
  for (let i = 0; i < localFields.length; i++) {
    const fields = localFields[i]!
    const entangledCount = braneEntangledMap[i]!.length
    const size = calculateBlockSizeEncoded(fields, fieldMeta, entangledCount)
    braneBlockPtrs.push(currentPtr)
    braneBlockSizes.push(size)
    currentPtr += size
  }

  // Создаём heap
  const heap = new Uint32Array(currentPtr)

  // Заполняем entangled блоки (entangled_count = 0)
  for (let i = 0; i < entangledKeys.length; i++) {
    const fields = entangledFields.get(entangledKeys[i]!)!
    const blockPtr = blockPtrs[i]!
    writeBlock(heap, blockPtr, fields, [], fieldMeta)
  }

  // Заполняем brane блоки
  for (let i = 0; i < localFields.length; i++) {
    const fields = localFields[i]!
    const blockPtr = braneBlockPtrs[i]!
    const entangledIds = braneEntangledMap[i]!
    const entangledPtrs = entangledIds.map((id) => blockPtrs[id]!)
    writeBlock(heap, blockPtr, fields, entangledPtrs, fieldMeta)
  }

  return {
    heap,
    blockPtrs: braneBlockPtrs,
    blockSizes: braneBlockSizes,
  }
}

/**
 * Рассчитать размер блока в словах.
 *
 * Формат блока (как в boundary/):
 * [local_count, entangled_count] — заголовок (2 слова)
 * [...field_descriptors] — дескрипторы полей (localCount * 2 слова)
 * [...entangled_ptrs] — указатели на entangled блоки (entangledCount слов)
 * [...values] — значения полей (сумма fieldSize слов)
 */
function calculateBlockSizeEncoded(
  fields: [number, number][],  // [fieldIndex, encodedValue]
  fieldMeta: Map<number, { fieldType: number; fieldSize: number }>,
  entangledCount: number,
): number {
  const localCount = fields.length

  // Заголовок: [local_count, entangled_count]
  const headerWords = 2

  // Дескрипторы полей: [field_id, meta] * localCount
  const descriptorWords = localCount * 2

  // Указатели на entangled блоки
  const entangledPtrsWords = entangledCount

  // Значения полей
  let valueWords = 0
  fields.forEach(([fieldId]) => {
    const meta = fieldMeta.get(fieldId)
    if (meta) {
      valueWords += meta.fieldSize
    }
  })

  return headerWords + descriptorWords + entangledPtrsWords + valueWords
}

/**
 * Записать блок в heap.
 *
 * Формат блока (как в boundary/):
 * [local_count, entangled_count, ...field_descriptors, ...entangled_ptrs, ...values]
 *
 * @param heap - Heap данные
 * @param blockPtr - Смещение блока
 * @param fields - Поля с уже закодированными значениями: [fieldIndex, encodedValue][]
 * @param entangledPtrs - Указатели на entangled блоки
 * @param fieldMeta - Метаданные полей: [fieldIndex, {fieldType, fieldSize}][]
 */
function writeBlock(
  heap: Uint32Array,
  blockPtr: number,
  fields: [number, number][],  // [fieldIndex, encodedValue]
  entangledPtrs: number[],
  fieldMeta: Map<number, { fieldType: number; fieldSize: number }>,
): void {
  const localCount = fields.length
  const entangledCount = entangledPtrs.length

  // Заголовок
  heap[blockPtr] = localCount
  heap[blockPtr + 1] = entangledCount

  // Дескрипторы полей (сразу после заголовка)
  let headerIndex = blockPtr + 2
  // entangled pointers идут после дескрипторов
  const entangledPtrsOffset = blockPtr + 2 + localCount * 2
  // значения идут после entangled pointers
  let bodyOffset = entangledPtrsOffset + entangledCount

  // Записываем дескрипторы полей
  for (const [fieldId, encodedValue] of fields) {
    const meta = fieldMeta.get(fieldId)
    if (!meta) continue

    const { fieldType, fieldSize } = meta

    heap[headerIndex++] = fieldId
    heap[headerIndex++] = packMeta(fieldType, fieldSize, bodyOffset - blockPtr)

    // Значение уже закодировано
    heap[bodyOffset] = encodedValue
    bodyOffset += fieldSize
  }

  // Записываем entangled pointers (после дескрипторов)
  for (let i = 0; i < entangledCount; i++) {
    heap[entangledPtrsOffset + i] = entangledPtrs[i] ?? 0
  }
}

/**
 * Найти смещение поля в блоке.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects.
 *
 * Формат блока (как в boundary/):
 * [local_count, entangled_count, ...field_descriptors, ...entangled_ptrs, ...values]
 *
 * @param heap - Heap данные
 * @param blockPtr - Смещение блока в heap
 * @param targetFieldId - Индекс искомого поля
 * @returns Смещение значения в heap или null если не найдено
 *
 * @example
 * ```typescript
 * const offset = findFieldOffset(heap, blockPtr, 0)
 * if (offset !== null) {
 *   const value = heap[offset]
 * }
 * ```
 */
export function findFieldOffset(
  heap: Uint32Array,
  blockPtr: number,
  targetFieldId: number,
): number | null {
  const localCount = heap[blockPtr]!

  // Дескрипторы полей начинаются сразу после заголовка (2 слова)
  const descBase = blockPtr + 2

  for (let i = 0; i < localCount; i++) {
    const descOffset = descBase + i * 2
    const fieldId = heap[descOffset]!

    if (fieldId === targetFieldId) {
      const packedMeta = heap[descOffset + 1]!
      const { offset } = unpackMeta(packedMeta)
      return blockPtr + offset
    }
  }

  return null
}
