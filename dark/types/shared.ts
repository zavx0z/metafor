import type {Axion} from "../strong/Axion.ts"
import type {Fuzzy} from "../strong/Fuzzy.ts"
import type {Macho} from "../strong/Macho.ts"
import type {Wimp} from "../strong/Wimp.ts"

/** ID частицы. */
export type ParticleID = string

/** ID поля. */
export type FieldID = string

/** ID меты. */
export type MetaID = string

/** ID meta-поля. */
export type MetaFieldID = string

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
