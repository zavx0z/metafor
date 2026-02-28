/**
 * @boundary/dump — бинарная сериализация Matrix.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * Низкоуровневая сериализация состояния Matrix:
 * - `serializeMatrix()` — конвертация состояния в бинарный формат
 * - `deserializeMatrix()` — восстановление состояния из бинарных данных
 *
 * ## Бинарный формат
 *
 * ```
 * Заголовок (12 байт):
 *   [magic: 4][version: 4][sectionCount: 4]
 *
 * Дескрипторы секций (12 байт × N):
 *   [type: 4][offset: 4][size: 4]
 *
 * Данные секций:
 *   HEAP, BYTECODE, BYTECODE_OFFSETS, STATES,
 *   STRING_REGISTRY, STRING_HEAP, FIELDS, METADATA
 * ```
 */

export { serializeMatrix, deserializeMatrix } from "./codec"
export type {
  MatrixState,
  DeserializedState,
  BinaryHeader,
  SectionType,
  SectionDescriptor,
} from "./format.t"
export { MAGIC_NUMBER, FORMAT_VERSION } from "./format.t"
