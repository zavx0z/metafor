import type { DarkParticle, DarkStore, ParticleID } from "@dark/types"

export const dark$: DarkStore = {
  particles: new Map<ParticleID, DarkParticle>(),
  parent: new WeakMap<DarkParticle, DarkParticle>(),
}
