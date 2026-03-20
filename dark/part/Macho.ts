import type { MachoInit } from "@dark/types/part"

import { BaseParticle } from "./part.ts"

export class Macho extends BaseParticle {
  constructor(init: MachoInit = {}) {
    super(init)
  }
}
