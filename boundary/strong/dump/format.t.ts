/**
 * Типы dump-проекции снимка внутри `Boundary × Strong`.
 */

import type {
  BinaryHeader as BoundaryBinaryHeader,
  BoundaryStateSnapshot,
  DeserializedBoundaryState,
  SectionDescriptor as BoundarySectionDescriptor,
} from "../snapshot/types"

export { MAGIC_NUMBER, FORMAT_VERSION, SectionType } from "../snapshot/types"

export type BinaryHeader = BoundaryBinaryHeader
export type SectionDescriptor = BoundarySectionDescriptor
export type BoundarySnapshot = BoundaryStateSnapshot
export type RestoredBoundaryState = DeserializedBoundaryState
