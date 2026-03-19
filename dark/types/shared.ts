import type { Axion, Fuzzy, Macho, Wimp } from "../part"

export type ParticleID = string
export type FieldID = string
export type WimpID = ParticleID
export type FuzzyID = ParticleID
export type MachoID = ParticleID
export type AxionID = ParticleID

export type DarkParticle = Wimp | Axion | Fuzzy | Macho

export interface DarkStore {
  meta: Map<WimpID, string>
  particles: Map<ParticleID, DarkParticle>
  parent: WeakMap<DarkParticle, DarkParticle>
}
