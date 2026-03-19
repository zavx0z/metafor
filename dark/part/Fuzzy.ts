import { AbstractParticle, type AbstractParticleInit, type ParticleID } from "./Abstract.ts"

export type FuzzyID = ParticleID
export type FuzzyInit = AbstractParticleInit & {
  basis: string | string[]
  expr?: string
}

export class Fuzzy extends AbstractParticle {
  readonly kind = "fuzzy" as const

  basis: string | string[]

  expr: string | undefined

  constructor({ id, children = [], basis, expr }: FuzzyInit) {
    super({ id, children })
    this.basis = basis
    if (expr !== undefined) {
      this.expr = expr
    }
  }

  override toJSON(): {
    id: FuzzyID
    kind: "fuzzy"
    children: string[]
    basis: string | string[]
    expr?: string
  } {
    const base = super.toJSON()

    return {
      id: base.id,
      kind: "fuzzy",
      children: base.children,
      basis: this.basis,
      ...(this.expr !== undefined ? { expr: this.expr } : {}),
    }
  }
}
