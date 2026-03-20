import type { ParticleID } from "@dark/types"
import type { BaseParticleInit } from "@dark/types/part"

export abstract class BaseParticle {
  readonly id: ParticleID
  readonly children: Set<ParticleID>

  protected constructor(init: BaseParticleInit = {}) {
    this.id = crypto.randomUUID()
    this.children = new Set(init.children ?? [])
  }
}
