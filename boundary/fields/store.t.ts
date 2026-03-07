/**
 * Типы для @boundary/fields/store.
 *
 * @packageDocumentation
 */

/**
 * Данные локального хранилища (без методов).
 *
 * Используется для передачи состояния в `fields$.restore()`.
 */
export interface FieldsData {
  /**
   * Определения полей из последнего вызова write().
   *
   * Каждый элемент массива описывает тип данных одного поля:
   * - `type` — тип значения (F32, U32, BOOL, STRING_PTR, ARRAY_PTR)
   * - `elementType` — тип элементов для массивов
   * - `enum` — список допустимых значений для enum-полей
   *
   * Индекс в массиве = индекс поля в бране.
   *
   * ## Зачем нужно
   *
   * В update() для определения как кодировать новое значение:
   * - Для F32 — записать как float
   * - Для STRING — интернировать строку и записать hash
   * - Для ARRAY — аллоцировать место в heap и записать элементы
   */
  fields: import("./index.t.ts").Field[]

  /**
   * Текущее смещение для динамических аллокаций ARRAY в heap.
   *
   * Указывает на начало свободной зоны в heap для временных данных массивов.
   *
   * ## Жизненный цикл
   *
   * - Вычисляется в write() как `heap.length - arrayReserveSize`
   * - Инкрементируется при аллокации ARRAY в update()
   * - Сбрасывается после каждого update() для повторного использования
   */
  heapAllocOffset: number

  /**
   * Размер резервированной зоны для ARRAY в heap.
   *
   * Вычисляется как максимальный размер ARRAY среди всех полей.
   */
  arrayReserveSize: number

  /**
   * Флаг: данные ARRAY невалидны после update().
   *
   * Устанавливается в `true` после записи ARRAY полей.
   * Сбрасывается в `false` после следующего update().
   */
  arrayDataInvalidated: boolean
}

/**
 * Состояние локального хранилища `@boundary/fields` с методами управления.
 *
 * Хранит данные, которые использует ТОЛЬКО `@boundary/fields`:
 * - {@link FieldsData.fields | fields} — для кодирования значений в update()
 * - {@link FieldsData.heapAllocOffset | heapAllocOffset}, {@link FieldsData.arrayReserveSize | arrayReserveSize}, {@link FieldsData.arrayDataInvalidated | arrayDataInvalidated} — для управления ARRAY аллокациями
 *
 * ## Почему локальное
 *
 * Эти данные не вынесены в `boundary$` (общее хранилище домена), так как не используются другими пакетами.
 *
 * ## Жизненный цикл
 *
 * 1. **write()** — наполняет через `fields$.restore()`
 * 2. **update()** — читает напрямую из `fields$` для кодирования и аллокации
 */
export interface FieldsStore extends FieldsData {
  /**
   * Сбрасывает состояние хранилища.
   */
  reset(): void

  /**
   * Восстанавливает состояние хранилища из переданных данных.
   * @param state - Данные для восстановления
   */
  restore(state: FieldsData): void
}
