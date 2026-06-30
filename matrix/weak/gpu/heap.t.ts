/**
 * Типы для @matrix/weak/gpu/heap.
 *
 * @packageDocumentation
 */

/** Точечное обновление слова в производном GPU heap. */
export interface GpuHeapWordUpdate {
  offset: number
  value1: number
  value2?: number
}

/** Диапазон слов heap, занятый производным payload массива. */
export interface ArrayHeapSlot {
  ptr: number
  size: number
}
