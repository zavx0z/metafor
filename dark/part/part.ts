import type { ParticleID } from "@dark/types"
import type { BaseParticleInit } from "@dark/types/part"

export abstract class BaseParticle {
  readonly id: ParticleID

  readonly children: Set<ParticleID>

  protected constructor({ children = [] }: BaseParticleInit) {
    this.id = crypto.randomUUID()
    this.children = new Set(children)
  }

  addChild(childId: ParticleID): this {
    this.children.add(childId)
    return this
  }

  removeChild(childId: ParticleID): this {
    this.children.delete(childId)
    return this
  }

  hasChild(childId: ParticleID): boolean {
    return this.children.has(childId)
  }
}
