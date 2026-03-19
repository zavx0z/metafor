export type ParticleID = string

export type ParticleKind = "wimp" | "fuzzy" | "macho" | "axion"

export type AbstractParticleInit = {
  id: ParticleID
  children?: Iterable<ParticleID>
}

export abstract class AbstractParticle {
  abstract readonly kind: ParticleKind

  readonly id: ParticleID

  readonly children: Set<ParticleID>

  protected constructor({ id, children = [] }: AbstractParticleInit) {
    this.id = id
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

  toJSON(): { id: ParticleID; kind: ParticleKind; children: ParticleID[] } {
    return {
      id: this.id,
      kind: this.kind,
      children: [...this.children],
    }
  }
}
