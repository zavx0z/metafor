import type { BulkDarkParticle, BulkDarkParticleInput, BulkFieldParticle } from "./manifest.ts"

export interface BulkLayoutSnapshotConfig {
  deepestFieldSphereRadiusMm: number
  nestingCoefficient: number
  packingDensityCoefficient: number
  rootOuterDiameterMm: number
  sphereMinScaleFactor: number
}

export interface DepthLabelVisibilityOptions {
  baseDepth: number
  depth: number
  labelVisibleLevels: number
}

export interface DarkParticleLabelVisibilityOptions extends DepthLabelVisibilityOptions {
  isActiveDarkParticle: boolean
}

export interface LayoutFieldParticleNode extends BulkFieldParticle {
  extent: number
}

export interface LayoutDarkParticleNode extends Omit<BulkDarkParticle, "parentDarkParticleId" | "depth" | "darkParticleOrder"> {
  children: LayoutDarkParticleNode[]
  contentWeight: number
  fieldParticles: LayoutFieldParticleNode[]
  depthFromRoot: number
  innerRadius: number
  outerRadius: number
}

export interface DarkParticleInputNode {
  descriptor: BulkDarkParticleInput
  children: DarkParticleInputNode[]
  depthFromRoot: number
}

export type OrbitItem =
  | {
      extent: number
      fieldParticle: LayoutFieldParticleNode
      kind: "fieldParticle"
    }
  | {
      extent: number
      kind: "darkParticle"
      darkParticle: LayoutDarkParticleNode
    }
