import type { MetaInit } from "@dark/types/strong"
import type { MatterRelationParticle } from "./matter.t.ts"

export interface DarkMetaParticleModel {
  meta: MetaInit
  particles: MatterRelationParticle[]
}
