export type Part = "graviton" | "photon" | "gluon" | "higgs" | "w+" | "w-" | "z"

export type ParticleOperation = "add" | "remove" | "replace" | "move" | "copy" | "test"

export interface Particle {
  part: Part
  op: ParticleOperation
  path: string | number
  value?: unknown
  from?: string | number
  [key: string]: unknown
}

export interface PhotonPayload {
  value: string
  path: string | number
}

export type ForcePartInput = Pick<Particle, "part" | "op" | "path" | "value" | "from">
