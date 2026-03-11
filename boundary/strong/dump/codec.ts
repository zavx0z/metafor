/**
 * Сериализация и восстановление boundary-снимка через strong-слой.
 */

import { deserializeBoundaryState, serializeBoundaryState } from "../snapshot/codec"
import type { BoundarySnapshot, RestoredBoundaryState } from "./format.t"

export function serializeBoundarySnapshot(state: BoundarySnapshot): Uint8Array {
  return serializeBoundaryState(state)
}

export function deserializeBoundarySnapshot(data: Uint8Array): RestoredBoundaryState {
  return deserializeBoundaryState(data)
}
