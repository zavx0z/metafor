export type Part = "inflaton" | "graviton" | "photon" | "gluon" | "higgs" | "w+" | "w-" | "z"

export type ParticleOperation = "add" | "remove" | "replace" | "move" | "copy" | "test"

export const isParticleTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

export interface Particle {
  part: Part
  op: ParticleOperation
  path: string | number
  ts: number
  value?: unknown
  from?: string | number
}

export interface PhotonPayload {
  value: string
  path: string | number
}

export type ForcePartInput = Pick<Particle, "part" | "op" | "path" | "ts" | "value" | "from">
