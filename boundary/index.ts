/**
 * `@boundary` — публичный API Boundary.
 *
 * @packageDocumentation
 *
 * ## Архитектура
 *
 * Модуль предоставляет единый интерфейс для внешних пакетов:
 * - `write()` — запись канонической boundary-структуры
 * - `update()` — вычисление и чтение перехода состояний
 * - `unlock()` — снятие блокировки с бран
 * - `reset()` — сброс состояния
 * - `FieldType` — типы полей
 *
 * @example
 * ```typescript
 * import { write, update, unlock, FieldType } from "@boundary"
 *
 * // Инициализация
 * await write({
 *   fields: [{ type: FieldType.F32 }],
 *   branes: [{ values: [[0, 100]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null]] }],
 * })
 *
 * // Переход
 * const states = await update([[0, [[0, 100]]]])
 *
 * // Снятие блокировки
 * unlock([0, 1, 2])
 * ```
 */

export {
  write,
  update,
  unlock,
  reset,
  FieldType,
} from "./boundary"
