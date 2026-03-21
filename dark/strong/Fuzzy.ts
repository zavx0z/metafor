import type { DarkParticle } from "@dark/types"
import type { FuzzyInit } from "@dark/types/strong"
import { BaseParticle } from "./part.ts"

export class Fuzzy extends BaseParticle {
  value: DarkParticle | null
  branch: Map<DarkParticle, DarkParticle>

  constructor(init: FuzzyInit = {}) {
    super(init)
    this.value = init.value ?? null
    this.branch = new Map(init.branch ?? [])
  }

  switch(value: DarkParticle | null): DarkParticle | undefined {
    this.value = value
    if (value === null) return
    return this.branch.get(value)
  }
}
