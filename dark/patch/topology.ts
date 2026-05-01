import {Axion, Fuzzy, Macho, Wimp} from "../strong"
import type {DarkParticle} from "../types"
import {emit, path, type Updater} from "./_common.ts"

const kindOf = (particle: DarkParticle): "fuzzy" | "axion" | "macho" => {
  if (particle instanceof Fuzzy) return "fuzzy"
  if (particle instanceof Axion) return "axion"
  if (particle instanceof Macho) return "macho"
  throw new Error(`Particle ${particle.constructor.name} is not a topology particle`)
}

const resolveParentRef = (
  particle: DarkParticle,
): {kind: "actor" | "topology"; uuid: string} | null => {
  const parent = particle.parent
  if (!parent) return null
  if (parent instanceof Wimp) return {kind: "actor", uuid: parent.id}
  if (parent instanceof Fuzzy || parent instanceof Axion || parent instanceof Macho) {
    return {kind: "topology", uuid: parent.id}
  }
  return null
}

export interface TopologyEmitContext {
  position: number
  store: Updater
}

export const emitTopologyPatches = async (
  particle: Fuzzy | Axion | Macho,
  ctx: TopologyEmitContext,
): Promise<void> => {
  const kind = kindOf(particle)
  const parent = resolveParentRef(particle)
  await emit(ctx.store, "graviton", path("topology", particle.id), {
    parentActor: parent?.kind === "actor" ? parent.uuid : null,
    parentTopology: parent?.kind === "topology" ? parent.uuid : null,
    kind,
    position: ctx.position,
  })
}
