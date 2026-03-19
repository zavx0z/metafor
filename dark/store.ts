import type { DarkParticle, DarkStore, ParticleID, WimpID } from "@dark/types"
import type { Address } from "@dark/types/dark"

export const dark$: DarkStore = {
  meta: new Map<WimpID, Address>(),
  particles: new Map<ParticleID, DarkParticle>(),
  parent: new Map<ParticleID, ParticleID>(),
}
