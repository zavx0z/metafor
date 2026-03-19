import type { FuzzyInit } from "@dark/types/part"
import type { DarkParticle, ParticleID } from "@dark/types"

import { BaseParticle } from "./part.ts"

export class Fuzzy extends BaseParticle {
  value: ParticleID | null
  branch: Map<ParticleID, DarkParticle>

  constructor(init: FuzzyInit = {}) {
    super(init)
    this.value = init.value ?? null
    this.branch = new Map(init.branch)
  }

  switch(value: ParticleID | null): DarkParticle | undefined {
    this.value = value
    if (value === null) return
    return this.branch.get(value)
  }
}
