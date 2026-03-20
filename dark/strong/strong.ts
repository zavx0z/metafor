import type { DarkParticle } from "@dark/types"
import type { ParticleSeed, SeedParent } from "@dark/types/gravity"
import type { ParticleBuild } from "@dark/types/strong"
import { Axion, Fuzzy, Macho, Wimp } from "@dark/part"

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
        ...(seed.node.fields !== undefined ? { fields: seed.node.fields } : {}),
        ...(seed.node.mass !== undefined ? { mass: seed.node.mass } : {}),
      })
    case "fuzzy":
      return new Fuzzy()
    case "axion":
      return new Axion()
    case "macho":
      return new Macho({
        basis: seed.node.data,
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
