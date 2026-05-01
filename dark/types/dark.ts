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
