import type {ProcessExecutionId} from "shared/protocol/force/execution"
import type {EnergyProcessDescriptor} from "./process.ts"
import type {OracleProcessEnvironment} from "@metafor/types/metafor/environment"

export type PendingEnergyProcess = {
  atomId: number
  wimp: string
  state: string
  processId: number
  processExecutionId: ProcessExecutionId
  descriptor: EnergyProcessDescriptor
}

export type EnergyActionParams = {
  field: Record<string, unknown>
  value: Record<string, unknown>
  mass: Record<string, unknown>
  energy: Record<string, unknown>
  /** Aborted after this execution is detached for a structural rebuild. */
  signal: AbortSignal
  /** Present only for a native grant bound to this exact Process action. */
  environment?: OracleProcessEnvironment
  self: {
    atom: string
    meta: string
    path: string
  }
}
