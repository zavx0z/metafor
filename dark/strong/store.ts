import type { DarkParticle } from "@dark/types"
import type { ParticleSeed } from "@dark/types/gravity"

export const strong$ = {
  particles: new Map<ParticleSeed, DarkParticle>(),
  reset() {
    this.particles.clear()
  },
}
