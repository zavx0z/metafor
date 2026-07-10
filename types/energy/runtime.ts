import type { EnergyProcessDescriptor } from "./process.ts"

export type PendingEnergyProcess = {
  actorId: number
  wimp: string
  state: string
  execution: string
  processKey: string
  processRevision: number
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
