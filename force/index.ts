/**
 * Force — домен бизнес-логики (монады, состояния, намерения).
 *
 * @packageDocumentation
 */

import type { NodeType } from "@metafor/meta"
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

export {
  createMonad,
  deleteMonad,
  updateMonads,
  updateBoundary,
  onStateChange,
  registerProcesses,
  getProcessSchema,
  releaseLock,
  _resetState,
} from "./force"

export { convertField } from "./strong/field"
export type { FieldDefinition, FieldsDefinition, BraneStateChange, MonadUpdate } from "./index.t"
