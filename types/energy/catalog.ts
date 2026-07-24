import type { EnergyProcessDescriptor } from "./process.ts"
import type {MatterBindingValue} from "../metafor/matter.ts"

export interface EnergyAtomEntity {
  id: number
  parentAtom: number | null
  parentTopology: number | null
  wimp: string
  position: number
}

/** Serializable Matter descriptors only; live objects remain in Energy-local stores. */
export interface EnergyAtomContinuation {
  massBinding?: MatterBindingValue
  energyBinding?: MatterBindingValue
}

/** Boundary-authorized key files only; a key ID is never derived from Atom ID. */
export interface EnergyMassArtifact {
  id: number
  key: string
  keyId: string
  format: "json" | "binary"
  mime: string
  label: string | null
  description: string | null
}

export interface EnergyProcessEntity {
  id: number
  wimp: string
  state: string
  descriptor: EnergyProcessDescriptor
}

export interface EnergyFieldEntity {
  id: number
  wimp: string
  localId: number
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  required: boolean
  label: string | null
  default?: unknown
}

export interface EnergyVariantEntity {
  id: number
  wimp: string
  localId: number
  field: number
  position: number
  itemValue: string
}
