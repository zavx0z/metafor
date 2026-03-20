import { Fuzzy, Wimp } from "@dark/part"
import type { MetaAST } from "@metafor/ast"
import { particleGenerator } from "@dark/gravity"
import type { DarkParticle } from "@dark/types"
import type { ParticleSeed } from "@dark/types/gravity"
import { bindParticles, resolveFieldValues } from "@dark/strong"
import { dark$ } from "./store"

export const matterPipeline = (wimp: Wimp, ast: Pick<MetaAST, "matter" | "fields">, parent?: Wimp): Wimp[] => {
  wimp.values = resolveFieldValues(ast.fields)
  dark$.particles.set(wimp.id, wimp)
  dark$.meta.set(wimp.id, wimp.src)
  if (parent) dark$.parent.set(wimp, parent)

  if (!ast.matter) return []

  const wimps: Wimp[] = []
  const particles = new Map<ParticleSeed, DarkParticle>()

  for (const seeds of particleGenerator(wimp, ast.matter, ast.fields)) {
    for (const { particle, parent } of bindParticles(seeds, particles, ast.fields)) {
      parent.children.add(particle.id)
      if (parent instanceof Fuzzy) parent.branch.set(particle.id, particle)
      if (particle instanceof Wimp) {
        wimps.push(particle)
        dark$.meta.set(particle.id, particle.src)
      }
      dark$.particles.set(particle.id, particle)
      dark$.parent.set(particle, parent)
    }
  }
  return wimps
}
