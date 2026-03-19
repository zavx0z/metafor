import type { NodeMeta } from "@metafor/dsl"
import type { Mass } from "@metafor/dsl/types/metafor"

import type { DarkParticle, ParticleID } from "./shared.ts"

export interface BaseParticleInit {
  children?: Iterable<ParticleID>
}

export interface WimpInit extends BaseParticleInit {
  src: string
  fields?: NodeMeta["fields"]
  mass?: Mass | NodeMeta["mass"]
}

export interface FuzzyInit extends BaseParticleInit {
  value?: ParticleID | null
  branch?: Iterable<[ParticleID, DarkParticle]>
}

export interface MachoInit extends BaseParticleInit {
  basis: string
}

export interface AxionInit extends BaseParticleInit {
  basis?: string | string[]
  expr?: string
}
