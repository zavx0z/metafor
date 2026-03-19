import { AbstractParticle, type AbstractParticleInit, type ParticleID } from "./Abstract.ts"

export type AxionID = ParticleID
export type AxionInit = AbstractParticleInit & {
  basis?: string | string[]
  expr?: string
}

export class Axion extends AbstractParticle {
  readonly kind = "axion" as const

  basis: string | string[] | undefined

  expr: string | undefined

  constructor({ id, children = [], basis, expr }: AxionInit) {
    super({ id, children })
    if (basis !== undefined) {
      this.basis = basis
    }
    if (expr !== undefined) {
      this.expr = expr
    }
  }

  override toJSON(): {
    id: AxionID
    kind: "axion"
    children: string[]
    basis?: string | string[]
    expr?: string
  } {
    const base = super.toJSON()

    return {
      id: base.id,
      kind: "axion",
      children: base.children,
      ...(this.basis !== undefined ? { basis: this.basis } : {}),
      ...(this.expr !== undefined ? { expr: this.expr } : {}),
    }
  }
}
