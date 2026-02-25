/**
 * @file Конструктор самоописываемых блоков браны.
 *
 * Формирует блоки данных с заголовком метаданных для эффективного чтения на GPU.
 *
 * Формат блока:
 * ```
 * [HEADER]
 * ├── local_field_count: u32
 * ├── shared_brane_count: u32
 * └── field_descriptors[local_field_count]:
 *     ├── field_id: u32
 *     └── packed_meta: u32  // (type << 24) | (size << 16) | offset
 *
 * [BODY]
 * ├── shared_ptrs[shared_brane_count]: u32[]
 * └── field_values[]: значения полей (за которыми следуют выделения строк/массивов)
 * ```
 *
 * @packageDocumentation
 */

import { FieldType, type FieldTypeValue, type Field } from "../core/FieldRegistry"
import { HeapAllocator, type AllocResult } from "./HeapAllocator"
import { getStringAtlas, type StringId } from "../strings/StringAtlas"
import type { ValueTuple } from "../index.t"

/**
 * Результат построения блока.
 */
export interface BuildResult {
  /** Смещение блока в куче */
  blockPtr: number
  /** Размер блока в словах */
  blockSize: number
  /** Данные блока для записи в кучу */
  blockView: Uint32Array
  /** Дополнительные аллокации (строки, массивы) */
  extraAllocs: Array<{ offset: number; size: number; data?: Uint32Array }>
}

/**
 * Опции построения блока.
 */
export interface BuildOptions {
  /** Указатели на разделяемые блоки */
  sharedPtrs?: number[]
}

/**
 * Упаковать метаданные поля в одно 32-битное слово.
 *
 * Формат: [8 бит: тип] [8 бит: размер] [16 бит: смещение]
 *
 * @param field_type - Тип поля
 * @param field_size - Размер значения в словах (1 для скаляров, 2 для указателей)
 * @param field_offset - Смещение значения в блоке (в словах)
 * @returns Упакованное значение
 */
export function packMeta(field_type: number, field_size: number, field_offset: number): number {
  if (field_type >= 256) throw new Error(`field_type out of range: ${field_type}`)
  if (field_size >= 256) throw new Error(`field_size out of range: ${field_size}`)
  if (field_offset >= 65536) throw new Error(`offset out of range: ${field_offset}`)
  return ((field_type & 0xff) << 24) | ((field_size & 0xff) << 16) | (field_offset & 0xffff)
}

/**
 * Распаковать метаданные поля из u32.
 */
export function unpackMeta(packed: number): { type: number; size: number; offset: number } {
  return {
    type: (packed >>> 24) & 0xff,
    size: (packed >>> 16) & 0xff,
    offset: packed & 0xffff,
  }
}

/**
 * Кодировать строку в массив u32 (UTF-8 -> u32[]).
 *
 * @param str - Строка для кодирования
 * @returns Массив u32, где первый элемент — длина строки в байтах
 */
export function encodeString(str: string): Uint32Array {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  const wordCount = Math.ceil(bytes.length / 4) + 1 // +1 для длины
  const result = new Uint32Array(wordCount)
  result[0] = bytes.length
  const dataView = new DataView(result.buffer)
  for (let i = 0; i < bytes.length; i++) {
    dataView.setUint8(4 + i, bytes[i]!)
  }
  return result
}

/**
 * Декодировать строку из массива u32.
 *
 * @param data - Массив u32
 * @returns Декодированная строка
 */
export function decodeString(data: Uint32Array): string {
  const length = data[0]
  const bytes = new Uint8Array(data.buffer, 4, length)
  const decoder = new TextDecoder()
  return decoder.decode(bytes)
}

/**
 * Получить размер значения поля в словах.
 */
function getFieldSize(type: FieldTypeValue, value: unknown): number {
  switch (type) {
    case FieldType.F32:
    case FieldType.U32:
    case FieldType.BOOL:
      return 1
    case FieldType.STRING_PTR:
      // Указатель на строку: [heapOffset, byteLength]
      return 2
    case FieldType.ARRAY_PTR:
      // Указатель на массив: [heapOffset, length]
      return 2
    case FieldType.SHARED_PTR:
      // Указатель на shared брану (уже в заголовке)
      return 0
    default:
      return 1
  }
}

/**
 * Конструктор блоков браны.
 */
export class BraneBuilder {
  private encoder = new TextEncoder()
  private debug: boolean

  constructor(debug: boolean = false) {
    this.debug = debug
  }

  /**
   * Построить блок браны.
   *
   * @param params - Кортежи полей [[fieldId, value], ...]
   * @param fields - Карта полей fieldId -> Field
   * @param options - Опции построения
   * @returns Результат построения блока и дополнительных аллокаций (строки, массивы)
   */
  build(params: ValueTuple[], fields: Map<number, Field>, options: BuildOptions = {}): BuildResult {
    const sharedPtrs = options.sharedPtrs ?? []
    const sharedCount = sharedPtrs.length

    // Сортируем поля по fieldId для детерминизма.
    const sortedParams = [...params].sort((a, b) => a[0] - b[0])

    const localFieldCount = sortedParams.length

    // Рассчитываем размеры блока.
    const headerWords = 2 + localFieldCount * 2 // [count, count] + [field_id, meta] * N
    const bodyStart = headerWords
    const sharedPtrsSize = sharedCount

    // Раскладываем поля в блоке и вычисляем их смещения.
    let currentOffset = bodyStart + sharedPtrsSize
    const fieldLayouts = sortedParams.map(([fieldId, value]) => {
      const field = fields.get(fieldId)
      if (!field) {
        throw new Error(`Unknown field ID: ${fieldId}`)
      }
      const sizeInWords = getFieldSize(field.type, value)
      const offsetInWords = currentOffset
      currentOffset += sizeInWords
      if (this.debug) {
        console.log(
          `[BraneBuilder] Field ID=${fieldId}: type=${field.type}, size=${sizeInWords}, offset=${offsetInWords}`,
        )
      }
      return { fieldId, field, value, sizeInWords, offsetInWords }
    })

    const totalSize = currentOffset

    // Аллоцируем блок в куче.
    const blockAlloc = this.allocator.alloc(totalSize)
    if (!blockAlloc) {
      throw new Error(`Недостаточно памяти для блока размером ${totalSize}`)
    }

    // Создаём представление блока.
    const blockView = new Uint32Array(totalSize)

    // Заполняем заголовок.
    blockView[0] = localFieldCount
    blockView[1] = sharedCount

    // Заполняем дескрипторы полей.
    let headerIndex = 2
    for (const layout of fieldLayouts) {
      blockView[headerIndex++] = layout.fieldId
      const packedMeta = packMeta(layout.field.type, layout.sizeInWords, layout.offsetInWords)
      if (this.debug) {
        console.log(
          `[BraneBuilder] packMeta(${layout.field.type}, ${layout.sizeInWords}, ${layout.offsetInWords}) = ${packedMeta} (0x${packedMeta.toString(16)})`,
        )
      }
      blockView[headerIndex++] = packedMeta
    }

    // Заполняем указатели на разделяемые блоки.
    for (let i = 0; i < sharedCount; i++) {
      blockView[bodyStart + i] = sharedPtrs[i] ?? 0
    }

    // Заполняем значения полей и аллоцируем данные переменного размера.
    const extraAllocs: Array<{ offset: number; size: number; data?: Uint32Array }> = []
    const dataView = new DataView(blockView.buffer)

    for (const layout of fieldLayouts) {
      const offsetBytes = layout.offsetInWords * 4

      switch (layout.field.type) {
        case FieldType.F32:
          dataView.setFloat32(offsetBytes, Number(layout.value), true)
          break
        case FieldType.U32:
          if (Array.isArray(layout.field.enumValues)) {
            const enumIndex = layout.field.enumValues.indexOf(layout.value)
            if (enumIndex === -1) {
              throw new Error(
                `Значение '${String(layout.value)}' не найдено в enum #${layout.fieldId}: [${layout.field.enumValues.join(", ")}]`,
              )
            }
            dataView.setUint32(offsetBytes, enumIndex, true)
          } else {
            dataView.setUint32(offsetBytes, Number(layout.value), true)
          }
          break
        case FieldType.BOOL:
          dataView.setUint32(offsetBytes, layout.value ? 1 : 0, true)
          break
        case FieldType.STRING_PTR: {
          // Интернируем строку через StringAtlas
          const str = String(layout.value)
          const atlas = getStringAtlas()
          const stringId = atlas.intern(str)
          const meta = atlas.getMeta(stringId)

          if (this.debug) {
            console.log(`[BraneBuilder] Interned string "${str}" -> ID ${stringId}, hash ${meta?.hash}`)
          }

          if (!meta) {
            throw new Error(`Не удалось получить метаданные для строки: ${str}`)
          }

          // Записываем [stringId, hash] в блок браны
          dataView.setUint32(offsetBytes, stringId, true)
          dataView.setUint32(offsetBytes + 4, meta.hash, true)
          break
        }
        case FieldType.ARRAY_PTR: {
          if (!Array.isArray(layout.value)) {
            throw new Error(`Ожидался массив для поля #${layout.fieldId}`)
          }

          const elementType = layout.field.elementType
          const values = layout.value as unknown[]
          const arrayWords = values.length + 1
          const arrayBlock = this.allocator.alloc(arrayWords)
          if (!arrayBlock) {
            throw new Error(`Недостаточно памяти для массива длиной ${values.length}`)
          }

          const arrayView = new Uint32Array(arrayBlock.size)
          arrayView[0] = values.length

          for (let i = 0; i < values.length; i++) {
            const item = values[i]
            if (elementType === "float" || elementType === "number") {
              const buf = new Float32Array([Number(item)])
              arrayView[i + 1] = new Uint32Array(buf.buffer)[0]!
            } else if (elementType === "integer" || elementType === "boolean") {
              arrayView[i + 1] = Number(item)
            } else if (elementType === "string") {
              const atlas = getStringAtlas()
              const stringId = atlas.intern(String(item))
              arrayView[i + 1] = stringId
            } else {
              arrayView[i + 1] = Number(item)
            }
          }

          extraAllocs.push({
            offset: arrayBlock.offset,
            size: arrayBlock.size,
            data: arrayView,
          })

          dataView.setUint32(offsetBytes, arrayBlock.offset, true)
          dataView.setUint32(offsetBytes + 4, values.length, true)
          break
        }
        default:
          throw new Error(`Неподдерживаемый тип поля: ${layout.field.type}`)
      }
    }

    return {
      blockPtr: blockAlloc.offset,
      blockSize: totalSize,
      blockView,
      extraAllocs,
    }
  }

  /**
   * Вычислить размер блока без аллокации (для предварительной оценки).
   */
  calculateSize(params: ValueTuple[], fields: Map<number, Field>, sharedPtrsCount: number = 0): number {
    let fieldCount = 0
    let fieldsSize = 0
    for (const [fieldId, value] of params) {
      const field = fields.get(fieldId)
      if (!field) continue
      fieldCount++
      fieldsSize += getFieldSize(field.type, value)
    }
    // header + shared_ptrs + fields
    return 2 + fieldCount * 2 + sharedPtrsCount + fieldsSize
  }

  private allocator = new HeapAllocator(16384, 1)
}

/**
 * Утилиты для работы с блоками.
 */
export const BlockUtils = {
  /**
   * Получить количество локальных полей из заголовка блока.
   */
  getLocalFieldCount(block: Uint32Array): number {
    return block[0]!
  },

  /**
   * Получить количество указателей на разделяемые блоки.
   */
  getSharedCount(block: Uint32Array): number {
    return block[1]!
  },

  /**
   * Найти поле по ID и вернуть его смещение и метаданные.
   */
  findField(block: Uint32Array, targetFieldId: number): { offset: number; meta: ReturnType<typeof unpackMeta> } | null {
    const localCount = block[0]!
    for (let i = 0; i < localCount; i++) {
      const descOffset = 2 + i * 2
      const fieldId = block[descOffset]!
      if (fieldId === targetFieldId) {
        return {
          offset: descOffset,
          meta: unpackMeta(block[descOffset + 1]!),
        }
      }
    }
    return null
  },
}
