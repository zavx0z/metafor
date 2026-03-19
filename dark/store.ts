import type { DarkParticle, DarkStore, ParticleID } from "@dark/types"

export const dark$: DarkStore = {
  meta: new Map(),
  particles: new Map<ParticleID, DarkParticle>(),
  parent: new WeakMap<DarkParticle, DarkParticle>(),
}
