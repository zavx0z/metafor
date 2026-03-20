import type { FieldsAST } from "@metafor/ast"
import type { DarkParticle } from "@dark/types"
import type { ParticleSeed, SeedParent } from "@dark/types/gravity"
import type { ParticleBuild } from "@dark/types/strong"
import { Axion, Fuzzy, Macho, Wimp } from "@dark/part"
import { createFieldValueResolvers, resolveNodeFieldValues } from "./fields.ts"

const isParticleSeed = (value: SeedParent): value is ParticleSeed => "kind" in value

const resolveParent = (parent: SeedParent, particles: Map<ParticleSeed, DarkParticle>): DarkParticle => {
  if (!isParticleSeed(parent)) return parent

  const particle = particles.get(parent)
  if (!particle) throw new Error(`Particle seed parent is not materialized: ${parent.kind}`)
  return particle
}

const materializeParticle = (seed: ParticleSeed, fieldResolvers?: ReturnType<typeof createFieldValueResolvers>): DarkParticle => {
  switch (seed.kind) {
    case "wimp":
      return new Wimp({
        src: seed.src,
        ...(seed.node.fields !== undefined && fieldResolvers !== undefined
          ? { fields: resolveNodeFieldValues(seed.node.fields, fieldResolvers) }
          : {}),
        ...(seed.node.mass !== undefined ? { mass: seed.node.mass } : {}),
      })
    case "fuzzy":
      return new Fuzzy()
    case "axion":
      return new Axion()
    case "macho":
      return new Macho()
  }
}

export const materializeParticleLayer = (
  layer: ParticleSeed[],
  particles: Map<ParticleSeed, DarkParticle> = new Map(),
  fields?: FieldsAST,
): ParticleBuild[] => {
  const builds: ParticleBuild[] = []
  const fieldResolvers = fields ? createFieldValueResolvers(fields) : undefined

  for (const seed of layer) {
    const particle = materializeParticle(seed, fieldResolvers)
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
