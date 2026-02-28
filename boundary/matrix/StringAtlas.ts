import type { StringMeta, StringId, StringAtlasExport } from "./StringAtlas.t"
export type { StringAtlasExport }
/**
 * StringAtlas — система интернирования строк для высокопроизводительной работы на GPU.
 *
 * ## Архитектура
 *
 * Использует UTF-32 для хранения строк, где каждый символ занимает ровно одно u32 слово.
 * Это обеспечивает:
 * - Простоту доступа на GPU: `heap[pointer + index]` для получения N-го символа
 * - Отсутствие расхождения потоков (thread divergence)
 * - Предсказуемую производительность
 *
 * ## Структуры данных
 *
 * 1. **stringRegistry** — массив метаданных StringMeta для каждой строки
 * 2. **stringHeap** — плоский массив u32 с UTF-32 кодовыми точками
 * 3. **stringMap** — HashMap для быстрого поиска StringId по содержимому строки
 *
 * ## Двухступенчатое сравнение
 *
 * Для операции равенства используется двухступенчатая проверка:
 * 1. Быстрое сравнение 32-битных хэшей
 * 2. При совпадении хэшей — посимвольное сравнение для гарантии корректности
 *
 * Это обеспечивает защиту от коллизий хэшей при сохранении высокой производительности.
 *
 * @example
 * ```ts
 * const atlas = new StringAtlas()
 * const id1 = atlas.intern("hero")
 * const id2 = atlas.intern("hero") // Тот же ID
 * const id3 = atlas.intern("monster") // Новый ID
 *
 * // Экспорт для GPU
 * const gpu = atlas.export()
 * device.createBuffer({ size: gpu.registry.byteLength }, gpu.registry)
 * ```
 */
export class StringAtlas {
  /** Реестр метаданных строк. Индекс = StringId */
  private stringRegistry: StringMeta[] = []

  /** Куча символов UTF-32. Каждый элемент = одна кодовая точка */
  private stringHeap: number[] = []

  /** HashMap для быстрого поиска: нормализованная строка -> StringId */
  private stringMap: Map<string, StringId> = new Map()

  /** Счётчик уникальных строк */
  private nextId: StringId = 0

  /**
   * Интернирует строку, возвращая её уникальный идентификатор.
   *
   * Если строка уже была интернирована, возвращает существующий ID.
   * Иначе добавляет строку в атлас и возвращает новый ID.
   *
   * @param str - Строка для интернирования
   * @returns Уникальный идентификатор строки
   */
  intern(str: string): StringId {
    // Нормализуем строку (NFC для корректного сравнения комбинируемых символов)
    const normalized = str.normalize("NFC")

    // Проверяем, есть ли уже такая строка
    const existing = this.stringMap.get(normalized)
    if (existing !== undefined) {
      return existing
    }

    // Вычисляем хэш
    const hash = this.fnv1a32(normalized)

    // Кодируем строку в UTF-32
    const codePoints = this.encodeUtf32(normalized)

    // Создаём метаданные
    const meta: StringMeta = {
      pointer: this.stringHeap.length,
      length: codePoints.length,
      hash,
    }

    // Добавляем в кучу
    this.stringHeap.push(...codePoints)

    // Регистрируем
    const id = this.nextId++
    this.stringRegistry.push(meta)
    this.stringMap.set(normalized, id)

    return id
  }

  /**
   * Получает StringId для уже интернированной строки.
   *
   * @param str - Строка для поиска
   * @returns StringId или undefined, если строка не интернирована
   */
  getId(str: string): StringId | undefined {
    return this.stringMap.get(str.normalize("NFC"))
  }

  /**
   * Получает метаданные строки по её ID.
   *
   * @param id - Идентификатор строки
   * @returns Метаданные или undefined, если ID невалиден
   */
  getMeta(id: StringId): StringMeta | undefined {
    return this.stringRegistry[id]
  }

  /**
   * Получает строку по её ID (для отладки).
   *
   * @param id - Идентификатор строки
   * @returns Декодированная строка или undefined
   */
  getString(id: StringId): string | undefined {
    const meta = this.getMeta(id)
    if (!meta) return undefined

    const codePoints = this.stringHeap.slice(meta.pointer, meta.pointer + meta.length)
    return this.decodeUtf32(codePoints)
  }

  /**
   * Возвращает количество интернированных строк.
   */
  get count(): number {
    return this.nextId
  }

  /**
   * Экспортирует данные атласа для загрузки на GPU.
   *
   * @returns Плоские массивы для storage buffers
   */
  export(): StringAtlasExport {
    // Реестр: [ptr0, len0, hash0, ptr1, len1, hash1, ...]
    const registry = new Uint32Array(this.stringRegistry.length * 3)
    for (let i = 0; i < this.stringRegistry.length; i++) {
      const meta = this.stringRegistry[i]!
      registry[i * 3] = meta.pointer
      registry[i * 3 + 1] = meta.length
      registry[i * 3 + 2] = meta.hash
    }

    // Куча символов
    const heap = new Uint32Array(this.stringHeap)

    return {
      registry,
      heap,
      count: this.nextId,
    }
  }

  /**
   * Очищает атлас (для тестов).
   */
  clear(): void {
    this.stringRegistry = []
    this.stringHeap = []
    this.stringMap.clear()
    this.nextId = 0
  }

  /**
   * Кодирует строку в UTF-32 кодовые точки.
   */
  private encodeUtf32(str: string): number[] {
    const codePoints: number[] = []
    for (let i = 0; i < str.length; ) {
      const codePoint = str.codePointAt(i)!
      codePoints.push(codePoint)
      i += codePoint > 0xffff ? 2 : 1
    }
    return codePoints
  }

  /**
   * Декодирует UTF-32 кодовые точки в строку.
   */
  private decodeUtf32(codePoints: number[]): string {
    return String.fromCodePoint(...codePoints)
  }

  /**
   * Вычисляет FNV-1a 32-битный хэш строки.
   *
   * FNV-1a выбран за:
   * - Хорошее распределение
   * - Простоту реализации
   * - Производительность
   *
   * @param str - Строка для хэширования
   * @returns 32-битный хэш
   */
  private fnv1a32(str: string): number {
    const FNV_PRIME = 0x01000193
    const FNV_OFFSET = 0x811c9dc5

    let hash = FNV_OFFSET >>> 0

    for (let i = 0; i < str.length; i++) {
      const codePoint = str.codePointAt(i)!
      // Хэшируем каждый байт кодовой точки
      hash ^= codePoint & 0xff
      hash = Math.imul(hash, FNV_PRIME) >>> 0
      hash ^= (codePoint >> 8) & 0xff
      hash = Math.imul(hash, FNV_PRIME) >>> 0
      hash ^= (codePoint >> 16) & 0xff
      hash = Math.imul(hash, FNV_PRIME) >>> 0
      hash ^= (codePoint >> 24) & 0xff
      hash = Math.imul(hash, FNV_PRIME) >>> 0

      // Пропускаем суррогатную пару
      if (codePoint > 0xffff) i++
    }

    return hash >>> 0
  }
}

/**
 * Глобальный экземпляр StringAtlas.
 *
 * ## Lifecycle
 *
 * - Создаётся лениво при первом вызове `getStringAtlas()`
 * - **Сбрасывается** при каждом вызове `write()` через `resetStringAtlas()`
 * - Все string_id, полученные до `write()`, становятся невалидными после сброса
 *
 * ## Предупреждение
 *
 * **Не храните string_id между вызовами `write()`!**
 *
 * ## Потокобезопасность
 *
 * - `getStringAtlas()` **не является потокобезопасной** функцией
 * - При параллельных вызовах `write()`/`update()` возможна гонка за состояние атласа
 * - **Гарантия:** `write()` и `update()` используют mutex, поэтому вызываются последовательно
 *
 * @example
 * ```ts
 * // Правильно:
 * await write({ fields: [...], branes: [...] })  // Сбрасывает атлас
 * const states = await update(0, 0, "new string")  // Интернирует заново
 *
 * // Неправильно:
 * const id = atlas.intern("hello")  // id = 0
 * await write(...)  // Сброс! id больше не валиден
 * const states = await update(0, 0, id)  // ❌ Ошибка: id устарел
 *
 * // Опасно: параллельные вызовы
 * Promise.all([update(0, 0, "a"), update(1, 0, "b")])  // ❌ Гонка за атлас
 * await update(0, 0, "a")  // ✅ Последовательно
 * await update(1, 0, "b")
 * ```
 */
let globalAtlas: StringAtlas | null = null

/**
 * Получает глобальный экземпляр StringAtlas.
 *
 * @returns Глобальный атлас для интернирования строк
 */
export function getStringAtlas(): StringAtlas {
  if (!globalAtlas) {
    globalAtlas = new StringAtlas()
  }
  return globalAtlas
}

/**
 * Сбрасывает глобальный атлас (для тестов и `write()`).
 *
 * **Side Effect:** Все ранее интернированные string_id становятся невалидными.
 * Вызывается автоматически в `write()` перед инициализацией новых данных.
 */
export function resetStringAtlas(): void {
  globalAtlas = null
}
