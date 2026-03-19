import type { AxionInit } from "@dark/types/part"

import { BaseParticle } from "./part.ts"

export class Axion extends BaseParticle {
  basis?: string | string[]
  expr?: string

  constructor(init: AxionInit) {
    super(init)
    this.basis = init.basis
    this.expr = init.expr
  }
}
