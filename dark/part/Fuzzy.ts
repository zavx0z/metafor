import type { FuzzyInit } from "@dark/types/part"

import { BaseParticle } from "./part.ts"

export class Fuzzy extends BaseParticle {
  basis: string | string[]

  expr: string | undefined

  constructor({ children = [], basis, expr }: FuzzyInit) {
    super({ children })
    this.basis = basis
    if (expr !== undefined) {
      this.expr = expr
    }
  }
}

export type { FuzzyID } from "@dark/types"
