import type { MachoInit } from "@dark/types/part"

import { BaseParticle } from "./part.ts"

export class Macho extends BaseParticle {
  basis: string

  constructor(init: MachoInit) {
    super(init)
    this.basis = init.basis
  }
}
