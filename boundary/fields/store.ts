/**
 * @boundary/fields/store — локальное хранилище данных.
 *
 * @packageDocumentation
 *
 * Хранит данные для кодирования значений и управления ARRAY аллокациями.
 *
 * @see {@link FieldsStore} — тип состояния с документацией полей
 */

export type { FieldsStore, FieldsData } from "./store.t.ts"
import type { Field } from "./index.t.ts"
import type { FieldsStore } from "./store.t.ts"
import { createStoredStringInterner } from "./string-table"

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
export const fields$: FieldsStore = {
  fields: [] as Field[],
  stringTable: [""],
  stringInterner: createStoredStringInterner(),
  heapAllocOffset: 0,
  arrayReserveSize: 0,
  arrayDataInvalidated: false,

  reset() {
    this.fields = [] as Field[]
    this.stringTable = [""]
    this.stringInterner = createStoredStringInterner()
    this.heapAllocOffset = 0
    this.arrayReserveSize = 0
    this.arrayDataInvalidated = false
  },

  restore(state: FieldsStore) {
    this.fields = state.fields
    this.stringTable = state.stringTable
    this.stringInterner = state.stringInterner
    this.heapAllocOffset = state.heapAllocOffset
    this.arrayReserveSize = state.arrayReserveSize
    this.arrayDataInvalidated = state.arrayDataInvalidated
  },
}
