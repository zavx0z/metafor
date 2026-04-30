import type {DarkParticle, DarkStore, ParticleID} from "@dark/types"

export const dark$: DarkStore = {
  meta: new Map(),
  fields: new Map(),
  particles: new Map<ParticleID, DarkParticle>(),
  metaIndex: new Map(),
}
