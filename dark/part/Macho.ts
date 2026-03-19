import { AbstractParticle, type AbstractParticleInit, type ParticleID } from "./Abstract.ts"

export type MachoID = ParticleID
export type MachoInit = AbstractParticleInit & {
  basis: string
}

export class Macho extends AbstractParticle {
  readonly kind = "macho" as const

  basis: string

  constructor({ id, children = [], basis }: MachoInit) {
    super({ id, children })
    this.basis = basis
  }

  override toJSON(): {
    id: MachoID
    kind: "macho"
    children: string[]
    basis: string
  } {
    const base = super.toJSON()

    return {
      id: base.id,
      kind: "macho",
      children: base.children,
      basis: this.basis,
    }
  }
}
