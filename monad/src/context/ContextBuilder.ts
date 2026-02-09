/**
 * @file Конструктор самоописываемых блоков контекста.
 *
 * Формирует блоки данных с заголовком метаданных для эффективного чтения на GPU.
 *
 * Формат блока:
 * ```
 * [HEADER]
 * ├── local_field_count: u32
 * ├── shared_context_count: u32
 * └── field_descriptors[local_field_count]:
 *     ├── field_id: u32
 *     └── packed_meta: u32  // (type << 24) | (size << 16) | offset
 *
 * [BODY]
 * ├── shared_ptrs[shared_context_count]: u32[]
 * └── field_values[]: значения полей (за которыми следуют выделения строк/массивов)
 * ```
 *
 * @packageDocumentation
 */

import { GlobalFieldRegistry, FieldType, type FieldTypeValue, type FieldMeta } from "./GlobalFieldRegistry"
import { HeapAllocator, type AllocResult } from "./HeapAllocator"

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
  extraAllocs: Array<{ offset: number, size: number, data?: Uint32Array }>
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
  return ((field_type & 0xFF) << 24) | ((field_size & 0xFF) << 16) | (field_offset & 0xFFFF)
}

/**
 * Распаковать метаданные поля из u32.
 */
export function unpackMeta(packed: number): { type: number; size: number; offset: number } {
  return {
    type: (packed >>> 24) & 0xFF,
    size: (packed >>> 16) & 0xFF,
    offset: packed & 0xFFFF,
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
}/**
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
      // Указатель на shared контекст (уже в заголовке)
      return 0
    default:
      return 1
  }
}

/**
 * Конструктор блоков контекста.
 */
export class ContextBuilder {
  private encoder = new TextEncoder()

  constructor(
    private registry: GlobalFieldRegistry,
    private allocator: HeapAllocator
  ) {}

  /**
   * Построить блок контекста.
   *
   * @param context - Объект с полями {имя: значение}
   * @param options - Опции построения
   * @returns Результат построения блока и дополнительных аллокаций (строки, массивы)
   */
  build(context: Record<string, unknown>, options: BuildOptions = {}): BuildResult {
    const sharedPtrs = options.sharedPtrs ?? []
    const sharedCount = sharedPtrs.length

    // Сортируем поля по имени для детерминизма.
    const localEntries = Object.entries(context)
      .map(([name, value]) => {
        const meta = this.registry.getMeta(name)
        if (!meta) {
          throw new Error(`Неизвестное поле: ${name}`)
        }
        return { name, meta, value }
      })
      .sort((a, b) => a.meta.fieldId - b.meta.fieldId)

    const localFieldCount = localEntries.length

    // Рассчитываем размеры блока.
    const headerWords = 2 + localFieldCount * 2 // [count, count] + [field_id, meta] * N
    const bodyStart = headerWords
    const sharedPtrsSize = sharedCount

    // Раскладываем поля в блоке и вычисляем их смещения.
    let currentOffset = bodyStart + sharedPtrsSize
    const fieldLayouts = localEntries.map((entry) => {
      const sizeInWords = getFieldSize(entry.meta.type, entry.value)
      const offsetInWords = currentOffset
      currentOffset += sizeInWords
      return { ...entry, sizeInWords, offsetInWords }
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
      blockView[headerIndex++] = layout.meta.fieldId
      blockView[headerIndex++] = packMeta(layout.meta.type, layout.sizeInWords, layout.offsetInWords)
    }

    // Заполняем указатели на разделяемые блоки.
    for (let i = 0; i < sharedCount; i++) {
      blockView[bodyStart + i] = sharedPtrs[i] ?? 0
    }

    // Заполняем значения полей и аллоцируем данные переменного размера.
    const extraAllocs: Array<{ offset: number, size: number, data?: Uint32Array }> = []
    const dataView = new DataView(blockView.buffer)

    for (const layout of fieldLayouts) {
      const offsetBytes = layout.offsetInWords * 4

      switch (layout.meta.type) {
        case FieldType.F32:
          dataView.setFloat32(offsetBytes, Number(layout.value), true)
          break
        case FieldType.U32:
          dataView.setUint32(offsetBytes, Number(layout.value), true)
          break
        case FieldType.BOOL:
          dataView.setUint32(offsetBytes, layout.value ? 1 : 0, true)
          break
        case FieldType.STRING_PTR: {
          const str = String(layout.value)
          const encoded = this.encoder.encode(str)
          const stringWords = Math.ceil(encoded.length / 4) + 1 // +1 для длины.
          const stringBlock = this.allocator.alloc(stringWords)
          if (!stringBlock) {
            throw new Error(`Недостаточно памяти для строки длиной ${encoded.length}`)
          }

          // Записываем длину строки.
          const stringView = new Uint8Array(stringBlock.size * 4)
          new DataView(stringView.buffer).setUint32(0, encoded.length, true)

          // Записываем байты строки.
          stringView.set(encoded, 4)

          // Копируем в кучу.
          const heapWords = new Uint32Array(stringView.buffer)
          extraAllocs.push({ 
            offset: stringBlock.offset, 
            size: stringBlock.size,
            data: heapWords
          })

          // Записываем указатель на строку в блок.
          dataView.setUint32(offsetBytes, stringBlock.offset, true)
          dataView.setUint32(offsetBytes + 4, encoded.length, true)
          break
        }
        default:
          throw new Error(`Неподдерживаемый тип поля: ${layout.meta.type}`)
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
  calculateSize(context: Record<string, unknown>, sharedPtrsCount: number = 0): number {
    let fieldCount = 0
    let fieldsSize = 0
    for (const [name] of Object.entries(context)) {
      const meta = this.registry.getMeta(name)
      if (!meta) continue
      fieldCount++
      fieldsSize += getFieldSize(meta.type, context[name])
    }
    // header + shared_ptrs + fields
    return 2 + fieldCount * 2 + sharedPtrsCount + fieldsSize
  }
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