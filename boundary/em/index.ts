/**
 * `@boundary/em` — межграничная фасадная проекция переноса boundary-снимков.
 *
 * Каноническая логика восстановления принадлежит strong-слою.
 */

export { serializeBoundaryState, deserializeBoundaryState } from "../strong/snapshot"
export type {
  BoundaryStateSnapshot,
  DeserializedBoundaryState,
  BinaryHeader,
  SectionDescriptor,
  SectionType,
} from "../strong/snapshot"
export { MAGIC_NUMBER, FORMAT_VERSION } from "../strong/snapshot"
