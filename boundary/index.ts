/**
 * @boundary — публичный API для работы с матрицей суперпозиций.
 *
 * @packageDocumentation
 *
 * ## Архитектура
 *
 * Модуль предоставляет единый интерфейс для внешних пакетов:
 * - `write()` — инициализация матрицы
 * - `update()` — эволюция и чтение состояний
 * - `unlock()` — снятие блокировки с бран
 *
 * ## Ответственность
 *
 * - Ре-экспорт API из @boundary/fields
 * - Ре-экспорт типов из @boundary/fields
 * - Сокрытие внутренней реализации (GPU, store, atlas)
 *
 * @example
 * ```typescript
 * import { write, update, FieldType } from "@boundary"
 *
 * // Инициализация
 * await write({
 *   fields: [{ type: FieldType.F32 }],
 *   branes: [{ values: [[0, 100]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null]] }],
 * })
 *
 * // Эволюция
 * const states = await update([[0, [[0, 100]]]])
 *
 * // Снятие блокировки
 * unlock([0, 1, 2])
 * ```
 */

import { storeGet } from "@boundary/store"
import { matrixHeapUpdate } from "@boundary/matrix"

export { write, update, FieldType } from "@boundary/fields"
export type { Data, Field, Brane, Collapse, BraneValue } from "@boundary/fields"

/**
 * Снимает блокировку с указанных бран.
 *
 * @param indexes - Индексы бран в матрице, с которых снять блокировку.
 *
 * @remarks
 * Используется для разблокировки бран после завершения процессов.
 * Lock находится по смещению `blockPtr + 2` в heap.
 * Установка в `0` снимает блокировку.
 *
 * @example
 * ```typescript
 * // Снять блокировку с бран 0, 1, 2
 * unlock([0, 1, 2])
 * ```
 */
export function unlock(indexes: number[]): void {
  const commonState = storeGet()
  const { braneBlockPtrs } = commonState

  const unlockUpdates = indexes.map((index) => {
    const blockPtr = braneBlockPtrs[index]
    if (blockPtr === undefined) {
      throw new Error(`Brane at index ${index} not found in boundary`)
    }
    return { offset: blockPtr + 2, value1: 0 }
  })

  matrixHeapUpdate(unlockUpdates)
}
