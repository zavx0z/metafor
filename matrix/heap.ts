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
import { getStringAtlas } from "./StringAtlas"
import { encodeValue, encodeValueWithPair } from "./params"
import type { EncodingContext } from "./params.t"

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
  return ((fieldType & 0xff) << 24) | ((fieldSize & 0xff) << 16) | (fieldOffset & 0xffff)
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
    type: (packed >>> 24) & 0xff,
    size: (packed >>> 16) & 0xff,
    offset: packed & 0xffff,
  }
}

/**
 * Получить размер значения поля в словах.
 *
 * @param fieldType - Тип поля
 * @returns Размер в словах (1 или 2)
 */
function getFieldSize(fieldType: number): number {
  switch (fieldType) {
    case TYPE.FLOAT:
    case TYPE.UINT:
    case TYPE.BOOL:
      return 1
    case TYPE.STRING:
    case TYPE.ARRAY:
      return 2
    default:
      return 1
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
 * @param input - Входные данные: localFields, entangledFields, fieldTypes
 * @returns HeapLayout с плоским heap и метаданными блоков
 *
 * @example
 * ```typescript
 * const layout = buildHeap({
 *   localFields: [[[0, 100], [1, true]]],
 *   braneEntangledMap: [[]],
 *   entangledFields: new Map(),
 *   fieldTypes: new Map([[0, TYPE.FLOAT], [1, TYPE.BOOL]]),
 * })
 * // layout.heap: Uint32Array с данными
 * // layout.blockPtrs: [8] (начинается после null pointer)
 * ```
 */
export function buildHeap(input: HeapInput): HeapLayout {
  const { localFields, braneEntangledMap, entangledFields, fieldTypes, fieldEnums } = input

  // Собираем все блоки: сначала entangled, потом branes
  const allBlocks: [number, unknown][][] = []
  const entangledKeys = Array.from(entangledFields.keys())

  // Добавляем entangled блоки
  entangledKeys.forEach((key) => {
    allBlocks.push(entangledFields.get(key)!)
  })

  // Маппинг: entangled ключ → индекс блока в allBlocks
  const entangledKeyToIndex = new Map<string, number>()
  entangledKeys.forEach((key, idx) => {
    entangledKeyToIndex.set(key, idx)
  })

  // Добавляем brane блоки
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
    const size = calculateBlockSize(fields, fieldTypes, 0) // entangled_count = 0
    blockSizes.push(size)
    blockPtrs.push(currentPtr)
    currentPtr += size
  }

  // Потом brane блоки
  const braneBlockPtrs: number[] = []
  for (let i = 0; i < localFields.length; i++) {
    const fields = localFields[i]!
    const entangledCount = braneEntangledMap[i]!.length
    const size = calculateBlockSize(fields, fieldTypes, entangledCount)
    blockSizes.push(size)
    braneBlockPtrs.push(currentPtr)
    currentPtr += size
  }

  // Создаём heap
  const heap = new Uint32Array(currentPtr)

  // Заполняем entangled блоки
  for (let i = 0; i < entangledKeys.length; i++) {
    const fields = entangledFields.get(entangledKeys[i]!)!
    const blockPtr = blockPtrs[i]!
    writeBlock(heap, blockPtr, fields, fieldTypes, [], fieldEnums)
  }

  // Заполняем brane блоки
  for (let i = 0; i < localFields.length; i++) {
    const fields = localFields[i]!
    const blockPtr = braneBlockPtrs[i]!
    const entangledIds = braneEntangledMap[i]!
    const entangledPtrs = entangledIds.map((id) => blockPtrs[id]!)
    writeBlock(heap, blockPtr, fields, fieldTypes, entangledPtrs, fieldEnums)
  }

  return {
    heap,
    blockPtrs: braneBlockPtrs,
    blockSizes: blockSizes.slice(entangledKeys.length),
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
function calculateBlockSize(
  fields: [number, unknown][],
  fieldTypes: Map<number, number>,
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
    const fieldType = fieldTypes.get(fieldId) ?? TYPE.UINT
    valueWords += getFieldSize(fieldType)
  })
  
  return headerWords + descriptorWords + entangledPtrsWords + valueWords
}

/**
 * Записать блок в heap.
 *
 * Формат блока (как в boundary/):
 * [local_count, entangled_count, ...field_descriptors, ...entangled_ptrs, ...values]
 * где field_descriptors: [field_id, packed_meta] * local_count
 */
function writeBlock(
  heap: Uint32Array,
  blockPtr: number,
  fields: [number, unknown][],
  fieldTypes: Map<number, number>,
  entangledPtrs: number[],
  fieldEnums?: Map<number, any[]>,
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
  for (const [fieldId, value] of fields) {
    const fieldType = fieldTypes.get(fieldId) ?? TYPE.UINT
    const fieldSize = getFieldSize(fieldType)

    heap[headerIndex++] = fieldId
    heap[headerIndex++] = packMeta(fieldType, fieldSize, bodyOffset - blockPtr)

    // Значение — используем encodeValue с enum контекстом
    const enumValues = fieldEnums?.get(fieldId)
    const ctx: EncodingContext = { type: fieldType }
    if (enumValues !== undefined) {
      ctx.enum = enumValues
    }

    // Для STRING и ARRAY используем encodeValueWithPair
    if (fieldType === TYPE.STRING || fieldType === TYPE.ARRAY) {
      const { value1, value2 } = encodeValueWithPair(value, ctx, heap, bodyOffset)
      heap[bodyOffset] = value1
      heap[bodyOffset + 1] = value2
    } else {
      const encoded = encodeValue(value, ctx)
      heap[bodyOffset] = encoded
    }
    bodyOffset += fieldSize
  }

  // Записываем entangled pointers (после дескрипторов)
  for (let i = 0; i < entangledCount; i++) {
    heap[entangledPtrsOffset + i] = entangledPtrs[i] ?? 0
  }
}

/**
 * Записать закодированное значение в heap.
 * Получает уже закодированное значение из encodeValue.
 */
function writeValue(
  heap: Uint32Array,
  offset: number,
  fieldType: number,
  encodedValue: number,
): void {
  switch (fieldType) {
    case TYPE.FLOAT:
    case TYPE.UINT:
    case TYPE.BOOL:
      // Для скаляров encodedValue — это готовое значение
      heap[offset] = encodedValue
      break
    case TYPE.STRING:
      // STRING: encodedValue = string_id, но нам также нужен hash
      // Для простоты записываем только string_id (hash будет записан отдельно)
      heap[offset] = encodedValue
      // Hash должен быть записан в offset + 1, но encodeValue возвращает только одно значение
      // Поэтому для STRING нужно использовать encodeValueWithPair
      heap[offset + 1] = 0  // placeholder для hash
      break
    case TYPE.ARRAY:
      // ARRAY: encodedValue = pointer в heap
      heap[offset] = encodedValue
      heap[offset + 1] = 0  // reserved
      break
    default:
      heap[offset] = encodedValue
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
