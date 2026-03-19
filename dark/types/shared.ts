import type { Axion, Fuzzy, Macho, Wimp } from "../part"
import type { SRC } from "@metafor/dsl"

export type ParticleID = string
export type FieldID = string
export type WimpID = ParticleID
export type FuzzyID = ParticleID
export type MachoID = ParticleID
export type AxionID = ParticleID

export type DarkParticle = Wimp | Axion | Fuzzy | Macho

/**
 * Минимальный скрытый граф частиц для `Dark`.
 *
 * Это не bulk/boundary-проекция и не runtime placement-graph.
 * Здесь фиксируется только скрытая связность:
 * - частицы по `id`,
 * - направленные связи `parent -> child`,
 * - отдельная привязка `Wimp -> meta`.
 *
 * @property roots — Корневые частицы текущего graph-fragment.
 * @property particles — Все частицы текущего fragment по ID.
 * @property parent — Обратная parent-связь для общего графа частиц.
 * @property meta — Привязка `Wimp`-частиц к конкретному `meta`-адресу.
 */
export interface DarkStore {
  meta: Map<WimpID, SRC>
  particles: Map<ParticleID, DarkParticle>
  parent: Map<ParticleID, ParticleID>
  // fields: Map<FieldID, DarkField>
}
