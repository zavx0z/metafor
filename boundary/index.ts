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
 * ```
 */

export { write, update, FieldType } from "@boundary/fields"
export type { Data, Field, Brane, Collapse, BraneValue } from "@boundary/fields"
