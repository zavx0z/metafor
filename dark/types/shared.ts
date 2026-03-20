import type { Axion, Fuzzy, Macho, Wimp } from "../part"

/** ID частицы. */
export type ParticleID = string

/** ID поля. */
export type FieldID = string

/** ID Wimp. */
export type WimpID = ParticleID

/** ID Fuzzy. */
export type FuzzyID = ParticleID

/** ID Macho. */
export type MachoID = ParticleID

/** ID Axion. */
export type AxionID = ParticleID

/**
 * Union-тип всех частиц Dark.
 */
export type DarkParticle = Wimp | Axion | Fuzzy | Macho

/**
 * Хранилище Dark-частиц.
 * @prop meta Map от WimpID к SRC-адресу
 * @prop particles Map от ParticleID к экземпляру частицы
 * @prop parent WeakMap от частицы к родительской частице
 */
export interface DarkStore {
  meta: Map<WimpID, string>
  particles: Map<ParticleID, DarkParticle>
  parent: WeakMap<DarkParticle, DarkParticle>
}
