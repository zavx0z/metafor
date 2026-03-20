import type { FieldsAST } from "@metafor/ast"
import type { DarkParticle } from "@dark/types"
import type { ParticleSeed, SeedParent } from "@dark/types/gravity"
import type { ParticleBuild } from "@dark/types/strong"
import type { WimpInit } from "@dark/types/part"
import { Axion, Fuzzy, Macho, Wimp } from "@dark/part"
import { createFieldValueResolvers, resolveNodeFieldValues } from "./fields.ts"
import { strong$ } from "./store.ts"

const isParticleSeed = (value: SeedParent): value is ParticleSeed => "kind" in value

const resolveParent = (parent: SeedParent): DarkParticle => {
  if (!isParticleSeed(parent)) return parent

  const particle = strong$.particles.get(parent)
  if (!particle) throw new Error(`Particle seed parent is not materialized: ${parent.kind}`)
  return particle
}

const materializeParticle = (
  seed: ParticleSeed,
  fieldResolvers?: ReturnType<typeof createFieldValueResolvers>,
): DarkParticle => {
  switch (seed.kind) {
    case "wimp": {
      const init: WimpInit = { src: seed.src }
      const values =
        seed.node.fields !== undefined && fieldResolvers !== undefined
          ? resolveNodeFieldValues(seed.node.fields, fieldResolvers)
          : undefined

      if (values !== undefined) init.values = values
      if (seed.node.mass !== undefined) init.mass = seed.node.mass

      return new Wimp(init)
    }
    case "fuzzy":
      return new Fuzzy()
    case "axion":
      return new Axion()
    case "macho":
      return new Macho()
  }
}

export const bindParticles = (layer: ParticleSeed[], fields?: FieldsAST): ParticleBuild[] => {
  const builds: ParticleBuild[] = []
  const fieldResolvers = fields ? createFieldValueResolvers(fields) : undefined

  for (const seed of layer) {
    const particle = materializeParticle(seed, fieldResolvers)
    const parent = resolveParent(seed.parent)

    strong$.particles.set(seed, particle)
    builds.push({ seed, particle, parent, meta: seed.meta })
  }

  return builds
}
