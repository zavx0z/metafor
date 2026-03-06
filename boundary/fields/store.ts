/**
 * @boundary/fields — локальное хранилище данных.
 *
 * @packageDocumentation
 *
 * Хранит данные для кодирования значений и управления ARRAY аллокациями.
 *
 * @see {@link FieldsStore} — тип состояния с документацией полей
 */

import type { Field } from "./index.t.ts"
import type { FieldsStore } from "./store.t.ts"

/**
 * Локальное состояние модуля `@boundary/fields`.
 *
 * Используется для кодирования значений и управления ARRAY аллокациями.
 *
 * @property fields {@link FieldsStore.fields|определения полей для кодирования значений}
 * @property heapAllocOffset {@link FieldsStore.heapAllocOffset|текущее смещение для ARRAY аллокаций}
 * @property arrayReserveSize {@link FieldsStore.arrayReserveSize|размер резервной зоны для ARRAY}
 * @property arrayDataInvalidated {@link FieldsStore.arrayDataInvalidated|флаг невалидности ARRAY данных}
 *
 * @see {@link FieldsStore} — тип состояния с документацией полей
 */
export const store: FieldsStore = {
  fields: [] as Field[],
  heapAllocOffset: 0,
  arrayReserveSize: 0,
  arrayDataInvalidated: false,
}

/**
 * Сбрасывает состояние store.
 * @internal
 */
export function storeReset(): void {
  store.fields = [] as Field[]
  store.heapAllocOffset = 0
  store.arrayReserveSize = 0
  store.arrayDataInvalidated = false
}

/**
 * Получает текущее состояние store.
 */
export function storeGet(): FieldsStore {
  return {
    fields: store.fields,
    heapAllocOffset: store.heapAllocOffset,
    arrayReserveSize: store.arrayReserveSize,
    arrayDataInvalidated: store.arrayDataInvalidated,
  }
}

/**
 * Восстанавливает состояние store.
 * @internal
 */
export function storeRestore(state: FieldsStore): void {
  store.fields = state.fields
  store.heapAllocOffset = state.heapAllocOffset
  store.arrayReserveSize = state.arrayReserveSize
  store.arrayDataInvalidated = state.arrayDataInvalidated
}
