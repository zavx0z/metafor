/**
 * `@boundary/em` — межграничная фасадная проекция переноса boundary-снимков.
 *
 * Каноническая логика восстановления принадлежит strong-слою.
 */

export { serializeBoundaryState, deserializeBoundaryState } from "@boundary/strong"
export type {
  BoundaryStateSnapshot,
  DeserializedBoundaryState,
  BinaryHeader,
  SectionDescriptor,
  SectionType,
} from "@boundary/strong"
export { MAGIC_NUMBER, FORMAT_VERSION } from "@boundary/strong"
