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
 * - Ре-экспорт API из @boundary/boundary
 * - Ре-экспорт типов из @boundary/boundary
 * - Сокрытие внутренней реализации (runtime, store, atlas, fields)
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

export {
  write,
  update,
  unlock,
  flattenBoundaryData,
  prepareData,
  validateData,
  buildHeap,
  findFieldOffset,
  packMeta,
  unpackMeta,
  compileEnsemble,
  compileFlattenedEnsemble,
  compileFlattenedSuperposition,
  compileSuperposition,
  compileParsedConditions,
  encodeValue,
  encodeFieldValue,
  fieldTypeToBytecodeType,
  floatToUint,
  uintToFloat,
  createStoredStringInterner,
  createStringAtlasExport,
  materializeEntanglement,
  parseCondition,
  OP,
  TYPE,
  getMatrixState,
  FieldType,
} from "./boundary"

export type {
  Data,
  Field,
  Brane,
  Collapse,
  BraneValue,
  FieldTypeValue,
  PreparedData,
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
  BoundarySharedBlockRecord,
  BoundaryBraneRecord,
  BoundaryScalarValue,
  BoundaryValue,
} from "./boundary"
