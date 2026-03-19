import type { ParticleID } from "@dark/types"

export abstract class BaseParticle {
  readonly id: ParticleID

  protected constructor() {
    this.id = crypto.randomUUID()
  }
}
