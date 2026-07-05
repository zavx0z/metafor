import type { EnergyProcessDescriptor } from "./process.ts"

export interface EnergyRuntimeSnapshot {
  version: 1
  actors: Array<[actorId: number, wimp: string]>
  processes: Array<{
    wimp: string
    state: string
    descriptor: EnergyProcessDescriptor
  }>
}
