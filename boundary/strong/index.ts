/**
 * `@boundary/strong` удерживает каноническую и согласованную store-форму Boundary.
 *
 * Этот слой отвечает и за восстановление snapshot, достаточного для повторного
 * разворачивания boundary-состояния.
 */

import { materializeEntanglement } from "./entangled"
import type { PreparedEntanglementProjection } from "./entangled.t"
import { assembleStoredBoundaryData } from "./stored"
import type { FlattenedBoundaryInput } from "../gravity/flattened.t"
import { createStoredStringInterner } from "./string-table"
import type { StoredStringTable } from "./string-table.t"
import { normalizeFieldValue } from "./normalize"
import type { PreparedData } from "../boundary.t"
import { deserializeBoundaryState, serializeBoundaryState } from "./snapshot/codec"
import type { BoundaryStateSnapshot, DeserializedBoundaryState } from "./snapshot/types"
import {
  deserializeBoundarySnapshot,
  serializeBoundarySnapshot,
} from "./dump/codec"
import type { BoundarySnapshot, RestoredBoundaryState } from "./dump/format.t"

export function prepareBoundaryData(data: FlattenedBoundaryInput): PreparedData {
  return assembleStoredBoundaryData(data)
}

export function restoreBoundaryState(data: Uint8Array): DeserializedBoundaryState {
  return deserializeBoundaryState(data)
}

export {
  assembleStoredBoundaryData,
  createStoredStringInterner,
  materializeEntanglement,
  normalizeFieldValue,
  serializeBoundaryState,
  deserializeBoundaryState,
  serializeBoundarySnapshot,
  deserializeBoundarySnapshot,
}
export type {
  FlattenedBoundaryInput,
  PreparedEntanglementProjection,
  StoredStringTable,
  PreparedData,
  BoundaryStateSnapshot,
  DeserializedBoundaryState,
  BoundarySnapshot,
  RestoredBoundaryState,
}
export { FieldType } from "../gravity/schema.t"
