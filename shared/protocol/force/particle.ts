export type Part = "inflaton" | "graviton" | "photon" | "gluon" | "higgs" | "w+" | "w-" | "z"

export type ParticleOperation = "add" | "remove" | "replace" | "move" | "copy" | "test"

export const isParticleTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

export interface Particle {
  part: Part
  op: ParticleOperation
  path: string | number
  /** Источник назначается локальной Force только в момент испускания. */
  by?: string
  ts: number
  value?: unknown
  from?: string | number
}

export interface PhotonPayload {
  value: string
  path: string | number
}

export interface SourcedParticle extends Particle {
  by: string
}

export type ForcePartInput = Omit<Particle, "by"> & {by?: never}
