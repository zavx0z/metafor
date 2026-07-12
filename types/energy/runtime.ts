import type {ProcessExecutionId} from "../force/execution.ts"
import type {EnergyProcessDescriptor} from "./process.ts"

export type PendingEnergyProcess = {
  actorId: number
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
  self: {
    atom: string
    meta: string
    path: string
  }
}
