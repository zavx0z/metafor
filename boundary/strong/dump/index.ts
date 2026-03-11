/**
 * Публичный вход dump-проекции снимка внутри `Boundary × Strong`.
 */

export {
  serializeBoundarySnapshot,
  deserializeBoundarySnapshot,
} from "./codec"
export type {
  BoundarySnapshot,
  RestoredBoundaryState,
  BinaryHeader,
  SectionType,
  SectionDescriptor,
} from "./format.t"
export { MAGIC_NUMBER, FORMAT_VERSION } from "./format.t"
