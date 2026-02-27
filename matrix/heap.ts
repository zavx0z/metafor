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
 * // layout.blockPtrs: [0]
 * ```
 */
export function buildHeap(input: HeapInput): HeapLayout {
  const { localFields, braneEntangledMap, entangledFields, fieldTypes } = input

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
  const blockSizes: number[] = []
  const blockPtrs: number[] = []
  let currentPtr = 0

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
    writeBlock(heap, blockPtr, fields, fieldTypes, [])
  }

  // Заполняем brane блоки
  for (let i = 0; i < localFields.length; i++) {
    const fields = localFields[i]!
    const blockPtr = braneBlockPtrs[i]!
    const entangledIds = braneEntangledMap[i]!
    const entangledPtrs = entangledIds.map((id) => blockPtrs[id]!)
    writeBlock(heap, blockPtr, fields, fieldTypes, entangledPtrs)
  }

  return {
    heap,
    blockPtrs: braneBlockPtrs,
    blockSizes: blockSizes.slice(entangledKeys.length),
  }
}

/**
 * Рассчитать размер блока в словах.
 */
function calculateBlockSize(
  fields: [number, unknown][],
  fieldTypes: Map<number, number>,
  entangledCount: number,
): number {
  const localCount = fields.length
  const headerWords = 2 + localCount * 2 // [local_count, entangled_count] + [field_id, meta] * N
  const entangledPtrsWords = entangledCount

  let bodyWords = entangledPtrsWords
  fields.forEach(([fieldId]) => {
    const fieldType = fieldTypes.get(fieldId) ?? TYPE.UINT
    bodyWords += getFieldSize(fieldType)
  })

  return headerWords + bodyWords
}

/**
 * Записать блок в heap.
 */
function writeBlock(
  heap: Uint32Array,
  blockPtr: number,
  fields: [number, unknown][],
  fieldTypes: Map<number, number>,
  entangledPtrs: number[],
): void {
  const localCount = fields.length
  const entangledCount = entangledPtrs.length

  // Заголовок
  heap[blockPtr] = localCount
  heap[blockPtr + 1] = entangledCount

  // Указатели на entangled блоки (сразу после заголовка)
  for (let i = 0; i < entangledCount; i++) {
    heap[blockPtr + 2 + i] = entangledPtrs[i] ?? 0
  }

  // Дескрипторы полей (после entangled pointers)
  let headerIndex = 2 + entangledCount
  let bodyOffset = blockPtr + 2 + entangledCount + localCount * 2

  for (const [fieldId, value] of fields) {
    const fieldType = fieldTypes.get(fieldId) ?? TYPE.UINT
    const fieldSize = getFieldSize(fieldType)

    heap[headerIndex++] = fieldId
    heap[headerIndex++] = packMeta(fieldType, fieldSize, bodyOffset - blockPtr)

    // Значение
    writeValue(heap, bodyOffset, fieldType, value)
    bodyOffset += fieldSize
  }
}

/**
 * Записать значение в heap.
 */
function writeValue(
  heap: Uint32Array,
  offset: number,
  fieldType: number,
  value: unknown,
): void {
  switch (fieldType) {
    case TYPE.FLOAT: {
      const view = new DataView(heap.buffer)
      view.setFloat32(offset * 4, Number(value), true)
      break
    }
    case TYPE.UINT:
    case TYPE.BOOL:
      heap[offset] = Number(value)
      break
    case TYPE.STRING:
      // StringId уже закодирован в params.ts
      heap[offset] = Number(value)
      heap[offset + 1] = 0 // hash placeholder (заполняется в StringAtlas)
      break
    default:
      heap[offset] = Number(value)
  }
}

/**
 * Найти смещение поля в блоке.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects.
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

  for (let i = 0; i < localCount; i++) {
    const descOffset = blockPtr + 2 + i * 2
    const fieldId = heap[descOffset]!

    if (fieldId === targetFieldId) {
      const packedMeta = heap[descOffset + 1]!
      const { offset } = unpackMeta(packedMeta)
      return blockPtr + offset
    }
  }

  return null
}
