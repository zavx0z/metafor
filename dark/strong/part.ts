import type { DarkParticle } from "@dark/types"
import type { BaseParticleInit } from "@dark/types/strong"

export abstract class BaseParticle {
  readonly id: string
  readonly children: Set<DarkParticle>
  parent: DarkParticle | null

  protected constructor(init: BaseParticleInit = {}) {
    this.id = crypto.randomUUID()
    this.children = new Set(init.children ?? [])
    this.parent = init.parent ?? null
  }
}
