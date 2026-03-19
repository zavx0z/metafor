import type { FuzzyInit } from "@dark/types/part"

import { BaseParticle } from "./part.ts"

export class Fuzzy extends BaseParticle {
  basis: string | string[]
  expr?: string

  constructor(init: FuzzyInit) {
    super(init)
    this.basis = init.basis
    if (init.expr) this.expr = init.expr
  }
}
