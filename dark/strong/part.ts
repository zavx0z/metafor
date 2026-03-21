import type { ParticleID } from "@dark/types"
import type { DarkParticle } from "@dark/types"
import type { BaseParticleInit } from "@dark/types/strong"

export abstract class BaseParticle {
  readonly id: ParticleID
  readonly children: Set<ParticleID>
  parent: DarkParticle | null

  protected constructor(init: BaseParticleInit = {}) {
    this.id = crypto.randomUUID()
    this.children = new Set(init.children ?? [])
    this.parent = init.parent ?? null
  }
}
