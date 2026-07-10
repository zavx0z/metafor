import type { EnergyProcessDescriptor } from "./process.ts"

export interface EnergyActorEntity {
  id: number
  parentActor: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

export interface EnergyProcessEntity {
  id: number
  wimp: string
  state: string
  descriptor: EnergyProcessDescriptor
}
