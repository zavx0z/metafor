import type {Continuation} from "../continuation.ts"
import type {MatterParticle} from "@metafor/types/matter"

export type ParticleRef = { kind: "actor"; id: number } | { kind: "topology"; id: number }

export interface BfsEntry {
  plan: MatterParticle
  parent: ParticleRef
}

export interface PendingChildWimp {
  src: string
  parent: ParticleRef
  continuation: Continuation
}
