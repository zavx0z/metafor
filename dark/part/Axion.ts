import type { AxionInit } from "@dark/types/part"

import { BaseParticle } from "./part.ts"

export class Axion extends BaseParticle {
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
}

export type { AxionID } from "@dark/types"
