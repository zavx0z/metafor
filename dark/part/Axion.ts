import type { AxionInit } from "@dark/types/part"

import { BaseParticle } from "./part.ts"

export class Axion extends BaseParticle {
  basis: string | string[] | undefined
  expr: string | undefined

  constructor({ children = [], basis, expr }: AxionInit) {
    super({ children })
    if (basis !== undefined) {
      this.basis = basis
    }
    if (expr !== undefined) {
      this.expr = expr
    }
  }
}

export type { AxionID } from "@dark/types"
