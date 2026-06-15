import type {MatterRelationParticle} from "@boundary/wimp/sqlite"
import type { MatterParticlePlan } from "../types/dark.ts"

const projectBoundaryMatterParticle = (particle: MatterRelationParticle): MatterParticlePlan => {
  const children =
    particle.children !== undefined && particle.children.length > 0
      ? particle.children.map((child) => ({
          edgeSlot: child.edgeSlot,
          particle: projectBoundaryMatterParticle(child.particle),
        }))
      : undefined

  switch (particle.kind) {
    case "wimp":
      return {
        kind: "wimp",
        src: particle.src,
        ...(particle.fieldsBinding !== undefined ? { fieldsBinding: particle.fieldsBinding } : {}),
        ...(particle.massBinding !== undefined ? { massBinding: particle.massBinding } : {}),
        ...(children !== undefined ? { children } : {}),
      }
    case "fuzzy":
      return {
        kind: "fuzzy",
        fuzzyKind: particle.fuzzyKind,
        ...(particle.predicateBinding !== undefined ? { predicateBinding: particle.predicateBinding } : {}),
        ...(children !== undefined ? { children } : {}),
      }
    case "axion":
      return {
        kind: "axion",
        predicateBinding: particle.predicateBinding,
        ...(children !== undefined ? { children } : {}),
      }
    case "macho":
      return {
        kind: "macho",
        collectionBinding: particle.collectionBinding,
        ...(children !== undefined ? { children } : {}),
      }
  }
}

export const projectBoundaryMatterParticles = (particles: MatterRelationParticle[]): MatterParticlePlan[] =>
  particles.map(projectBoundaryMatterParticle)
