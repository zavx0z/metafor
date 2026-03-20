import type { DarkParticle } from "./shared.ts"
import type { ParticleSeed } from "./gravity.ts"

/**
 * Результат materialization seed без dark-level wiring.
 * @prop seed Исходный seed
 * @prop particle Созданная частица
 */
export interface ParticleMaterialization {
  seed: ParticleSeed
  particle: DarkParticle
}

/**
 * Результат материализации seed в частицу.
 * @prop seed Исходный seed
 * @prop particle Созданная частица
 * @prop parent Родительская частица
 * @prop meta Резервированное поле для будущих метаданных
 */
export interface ParticleBuild {
  seed: ParticleSeed
  particle: DarkParticle
  parent: DarkParticle
  meta: Record<string, never>
}
