import type { EnergyProcessDescriptor } from "./process.ts"

export interface EnergyAtomEntity {
  id: number
  parentActor: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

/** @deprecated Use EnergyAtomEntity. */
export type EnergyActorEntity = EnergyAtomEntity

export interface EnergyProcessEntity {
  id: number
  wimp: string
  state: string
  descriptor: EnergyProcessDescriptor
}
