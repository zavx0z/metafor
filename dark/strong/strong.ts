import type { DarkParticle } from "@dark/types"
import type { ParticleSeed, SeedParent } from "@dark/gravity"
import { Axion, Fuzzy, Macho, Wimp } from "@dark/part"

export interface ParticleBuild {
  seed: ParticleSeed
  particle: DarkParticle
  parent: DarkParticle
  meta: Record<string, never>
}

const isParticleSeed = (value: SeedParent): value is ParticleSeed => "kind" in value

const resolveParent = (parent: SeedParent, particles: Map<ParticleSeed, DarkParticle>): DarkParticle => {
  if (!isParticleSeed(parent)) return parent

  const particle = particles.get(parent)
  if (!particle) throw new Error(`Particle seed parent is not materialized: ${parent.kind}`)
  return particle
}

const materializeParticle = (seed: ParticleSeed): DarkParticle => {
  switch (seed.kind) {
    case "wimp":
      return new Wimp({
        src: seed.src,
        ...(seed.fields !== undefined ? { fields: seed.fields } : {}),
        ...(seed.mass !== undefined ? { mass: seed.mass } : {}),
      })
    case "fuzzy":
      return new Fuzzy()
    case "axion":
      return new Axion({
        ...(seed.basis !== undefined ? { basis: seed.basis } : {}),
        ...(seed.expr !== undefined ? { expr: seed.expr } : {}),
      })
    case "macho":
      return new Macho({
        basis: seed.basis,
      })
  }
}

export const materializeParticleLayer = (
  layer: ParticleSeed[],
  particles: Map<ParticleSeed, DarkParticle> = new Map(),
): ParticleBuild[] => {
  const builds: ParticleBuild[] = []

  for (const seed of layer) {
    const particle = materializeParticle(seed)
    const parent = resolveParent(seed.parent, particles)

    particles.set(seed, particle)
    builds.push({
      seed,
      particle,
      parent,
      meta: seed.meta,
    })
  }

  return builds
}
