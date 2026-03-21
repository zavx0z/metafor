import type { Axion } from "../strong/Axion.ts"
import type { Fuzzy } from "../strong/Fuzzy.ts"
import type { Macho } from "../strong/Macho.ts"
import type { Wimp } from "../strong/Wimp.ts"

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
 * Union-тип всех Dark-частиц.
 */
export type DarkParticle = Wimp | Axion | Fuzzy | Macho

/**
 * Хранилище Dark-частиц.
 * @prop meta Map от WimpID к SRC-адресу
 * @prop particles Map от ParticleID к экземпляру частицы
 */
export interface DarkStore {
  meta: Map<WimpID, string>
  particles: Map<ParticleID, DarkParticle>
}
