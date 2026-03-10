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
 * - Экспорт публичного API Boundary
 * - Экспорт типов Boundary
 * - Сокрытие внутренней реализации (runtime, canonical store, подготовка данных)
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
 * // Эволюция
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

export type {
  PreparedData,
  Field,
  Data,
  Brane,
  Collapse,
  BraneValue,
  FieldTypeValue,
  FlattenedBoundaryInput,
  FlattenedBraneInput,
  FlattenedFieldChecks,
  FlattenedTransition,
  BoundaryData,
  BoundaryStore,
  BoundaryFieldRecord,
  BoundaryFieldValueRecord,
  BoundaryConditionRecord,
  BoundaryTransitionRecord,
  BoundaryStateRecord,
  BoundarySharedBlockRecord,
  BoundaryBraneRecord,
  BoundaryScalarValue,
  BoundaryValue,
} from "./boundary"
