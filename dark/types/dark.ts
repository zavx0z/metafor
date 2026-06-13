import type {Continuation} from "../continuation.ts"

export type MatterBindingValue =
  | string
  | boolean
  | {
      data?: string | string[]
      expr?: string
    }

export type MatterRelationBindingValue = Exclude<MatterBindingValue, boolean>

export interface MatterParticleWimpPlan {
  kind: "wimp"
  src: string
  fieldsBinding?: MatterRelationBindingValue
  massBinding?: MatterRelationBindingValue
  children?: MatterParticlePlan[]
}

export interface MatterParticleFuzzyPlan {
  kind: "fuzzy"
  fuzzyKind: "dynamic-meta" | "cond"
  predicateBinding?: MatterRelationBindingValue
  children?: MatterParticlePlan[]
}

export interface MatterParticleAxionPlan {
  kind: "axion"
  predicateBinding: MatterRelationBindingValue
  children?: MatterParticlePlan[]
}

export interface MatterParticleMachoPlan {
  kind: "macho"
  collectionBinding: MatterRelationBindingValue
  children?: MatterParticlePlan[]
}

export type MatterParticlePlan =
  | MatterParticleWimpPlan
  | MatterParticleFuzzyPlan
  | MatterParticleAxionPlan
  | MatterParticleMachoPlan

export type ParticleRef = { kind: "actor"; uuid: string } | { kind: "topology"; uuid: string }

export interface BfsEntry {
  plan: MatterParticlePlan
  parent: ParticleRef
}

export interface PendingChildWimp {
  src: string
  parent: ParticleRef
  continuation: Continuation
}
