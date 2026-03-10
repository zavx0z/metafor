/**
 * Force — домен бизнес-логики (акторы, состояния, намерения).
 *
 * @packageDocumentation
 */

import type { NodeType } from "@metafor/dsl"
import { loadDSL } from "@force/gravity"

export async function initial(path: string) {
  const schema = await loadDSL(path)

  const hierarchy: NodeType[] = schema.bulk.gravity

  console.log(hierarchy)

  for (const [key, value] of Object.entries(hierarchy)) {
    switch (value.type) {
      case "map": {
        break
      }
      case "cond": {
        break
      }
      case "log": {
        break
      }
      case "meta": {
        break
      }
      default:
        break
    }
  }
}

export { createActor, deleteActor, updateActors, updateBoundary, onStateChange, releaseLock } from "./force"

export { force$ } from "./store"
export type { ForceStoreState } from "./store.t"

export { registerProcesses, getProcessSchema } from "./weak"

export { convertField } from "./strong/field"
export {
  flattenGravity,
  buildStrongEntanglement,
  narrowEntanglementMembershipToBoundary,
  projectEntanglementToBoundary,
} from "./strong/strong"
export type { BraneStateChange, ActorUpdate, UpdateBoundaryOptions } from "./force.t"
