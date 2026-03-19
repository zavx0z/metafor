import type { MachoInit } from "@dark/types/part"

import { BaseParticle } from "./part.ts"

export class Macho extends BaseParticle {
  basis: string

  constructor({ children = [], basis }: MachoInit) {
    super({ children })
    this.basis = basis
  }
}

export type { MachoID } from "@dark/types"
