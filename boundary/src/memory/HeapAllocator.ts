/**
 * @file Менеджер памяти для GPU-кучи.
 *
 * Реализует стратегию "Список свободных блоков" (Free List) для управления
 * памятью в едином GPUBuffer. Поддерживает аллокацию, освобождение и
 * слияние (coalescing) смежных свободных блоков.
 *
 * @packageDocumentation
 */

/**
 * Результат успешной аллокации.
 */
export interface AllocResult {
  /** Смещение в словах (u32) от начала кучи */
  offset: number
  /** Размер выделенного блока в словах */
  size: number
}

/**
 * Свободный блок в списке.
 */
interface FreeBlock {
  /** Смещение в словах */
  offset: number
  /** Размер в словах */
  size: number
}

/**
 * Аллокатор GPU-кучи на базе стратегии "Список свободных блоков" (Free List).
 *
 * Все размеры и смещения измеряются в 32-битных словах (u32).
 */
export class HeapAllocator {
  /** Список свободных блоков */
  private freeList: FreeBlock[] = []
  /** Общий размер кучи в словах */
  private readonly totalSize: number
  /** Минимальный размер блока (для предотвращения фрагментации) */
  private readonly minBlockSize: number = 1

  /**
   * @param totalSize - Общий размер кучи в словах (u32)
   * @param reserveFirst - Количество слов для резервирования в начале (например, для заголовка)
   */
  constructor(totalSize: number, reserveFirst: number = 0) {
    if (totalSize <= reserveFirst) {
      throw new Error(`Размер кучи (${totalSize}) должен быть больше резерва (${reserveFirst})`)
    }

    this.totalSize = totalSize

    // Резервируем первые слова (например, слово 0 = null pointer)
    if (reserveFirst > 0) {
      this.freeList.push({ offset: reserveFirst, size: totalSize - reserveFirst })
    } else {
      this.freeList.push({ offset: 0, size: totalSize })
    }
  }

  /**
   * Выделить блок памяти.
   *
   * Использует стратегию "Первый подходящий" (First-Fit).
   *
   * @param size - Требуемый размер в словах
   * @returns Результат аллокации или null если нет подходящего блока
   */
  alloc(size: number): AllocResult | null {
    if (size <= 0) {
      throw new Error(`Размер должен быть положительным: ${size}`)
    }

    // Поиск первого подходящего блока
    for (let i = 0; i < this.freeList.length; i++) {
      const block = this.freeList[i]!
      if (block.size >= size) {
        const result: AllocResult = { offset: block.offset, size }

        // Если остаток достаточно большой, оставляем его в списке свободных блоков.
        // Иначе выделяем весь блок целиком.
        const remaining = block.size - size

        if (remaining >= this.minBlockSize) {
          // Разделяем блок: уменьшаем свободную часть.
          block.offset += size
          block.size = remaining
        } else {
          // Блок целиком уходит (с небольшим остатком, если есть).
          result.size = block.size
          this.freeList.splice(i, 1)
        }

        return result
      }
    }

    // Не найден подходящий блок.
    return null
  }

  /**
   * Освободить блок памяти.
   *
   * Возвращает блок в список свободных и выполняет слияние (coalescing)
   * со смежными свободными блоками для борьбы с фрагментацией.
   *
   * @param offset - Смещение освобождаемого блока
   * @param size - Размер освобождаемого блока
   */
  free(offset: number, size: number): void {
    if (size <= 0) {
      throw new Error(`Размер должен быть положительным: ${size}`)
    }

    if (offset < 0 || offset + size > this.totalSize) {
      throw new Error(`Недопустимый блок: offset=${offset}, size=${size}, total=${this.totalSize}`)
    }

    // Вставляем блок в список свободных (сохраняя сортировку по смещению).
    const newBlock: FreeBlock = { offset, size }
    this.freeList.push(newBlock)
    this.freeList.sort((a, b) => a.offset - b.offset)

    // Слияние смежных блоков (coalescing).
    const merged: FreeBlock[] = []

    for (const block of this.freeList) {
      const last = merged[merged.length - 1]

      if (!last) {
        merged.push({ ...block })
        continue
      }

      // Если текущий блок начинается сразу после последнего, объединяем их.
      if (last.offset + last.size === block.offset) {
        last.size += block.size
      } else {
        merged.push({ ...block })
      }
    }

    this.freeList = merged
  }

  /**
   * Получить копию списка свободных блоков.
   *
   * @returns Массив свободных блоков
   */
  getFreeList(): FreeBlock[] {
    return this.freeList.map((block) => ({ ...block }))
  }

  /**
   * Очищает состояние аллокатора и восстанавливает весь пул памяти.
   *
   * @remarks
   * **Side Effects:**
   * - Сбрасывает список свободных блоков к исходному состоянию.
   * - Восстанавливает всю память как свободную (с учетом резерва).
   */
  clear(): void {
    const reserveFirst = this.freeList.length > 0 && this.freeList[0]!.offset > 0
      ? this.freeList[0]!.offset
      : 0
    this.freeList = []
    if (reserveFirst > 0) {
      this.freeList.push({ offset: reserveFirst, size: this.totalSize - reserveFirst })
    } else {
      this.freeList.push({ offset: 0, size: this.totalSize })
    }
  }
}
