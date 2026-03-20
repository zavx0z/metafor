import type { AxionInit } from "@dark/types/strong"
import { BaseParticle } from "./part.ts"

export class Axion extends BaseParticle {
  constructor(init: AxionInit = {}) {
    super(init)
  }
}
