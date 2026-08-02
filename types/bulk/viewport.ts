import type { Color, Mesh, Object3D, Text, TextMaterial, ThinFilmMaterial, Vector3 } from "@metafor/engine"
import type {
  BulkReadyRenderDarkParticle,
  BulkReadyRenderFieldParticle,
} from "./visual.ts"
import type { TextExtents } from "./text.ts"

export interface BulkDarkParticlePickTarget {
  center: Vector3
  depth: number
  kind: "darkParticle"
  outerRadius: number
  parentDarkParticleId: number | null
  darkParticleId: number
  torusRadius: number
  torusTube: number
}

export interface BulkFieldParticlePickTarget {
  center: Vector3
  depth: number
  parentDarkParticleId: number
  fieldParticleId: string
  kind: "fieldParticle"
  outerRadius: number
  sphereRadius: number
}

export type BulkEmbeddedPickShape =
  | {
    form: "sphere"
    sphereRadius: number
  }
  | {
    form: "torus"
    torusRadius: number
    torusTube: number
  }

export type BulkOrbitalParticlePickTarget = {
  center: Vector3
  depth: number
  kind: "orbitalParticle"
  orbitalParticleId: string
  outerRadius: number
  parentDarkParticleId: number
} & BulkEmbeddedPickShape

export type BulkFieldProxyPickTarget = {
  center: Vector3
  depth: number
  fieldProxyId: string
  kind: "fieldProxy"
  outerRadius: number
  parentDarkParticleId: number
} & BulkEmbeddedPickShape

export type BulkPickTarget =
  | BulkDarkParticlePickTarget
  | BulkFieldParticlePickTarget
  | BulkOrbitalParticlePickTarget
  | BulkFieldProxyPickTarget

export interface ResolveBulkPickTargetOptions {
  hitPaddingMm?: number
}

export interface ResolveBulkHoverTargetOptions extends ResolveBulkPickTargetOptions {
  retentionHitPaddingMm?: number
}

export interface BulkPickHit {
  distance: number
  target: BulkPickTarget
}

export interface ResolveBulkViewportFocusPoseOptions {
  currentPosition: Vector3
  currentTarget: Vector3
  focusRadius: number
  fovRad: number
  nextTarget: Vector3
}

export interface ResolveBulkViewportFitPoseOptions {
  aspect: number
  centerProjectedBounds?: boolean
  currentPosition: Vector3
  currentTarget: Vector3
  fitAxis?: BulkViewportFitAxis
  fovRad: number
  paddingRatio?: number
  points?: readonly Vector3[]
  radius: number
  target: Vector3
  up?: Vector3
}

export interface BulkViewportFocusPose {
  position: Vector3
  target: Vector3
}

export type BulkViewportFitAxis = "auto" | "height" | "width"

export interface ResolveBulkHoverTransitionOptions {
  currentTarget: BulkPickTarget | null
  delayMs?: number
  nextTarget: BulkPickTarget | null
  nowMs: number
  pendingStartedAtMs: number | null
  pendingTarget: BulkPickTarget | null
}

export interface BulkHoverTransitionResult {
  committedTarget: BulkPickTarget | null
  pendingStartedAtMs: number | null
  pendingTarget: BulkPickTarget | null
}

export interface BulkHoverPriorityCandidate extends BulkPickHit {
  score: number
}

export interface ResolveBulkHoverPriorityTargetOptions {
  candidates: readonly BulkHoverPriorityCandidate[]
  currentTarget: BulkPickTarget | null
  hysteresisPx?: number
  parentByDarkParticleId?: ReadonlyMap<number, number | null>
}

export interface BulkClientPoint {
  x: number
  y: number
}

export type BulkHoverDirection = -1 | 0 | 1

export interface BulkViewportStats {
  fieldParticleCount: number
  orbitalParticleCount?: number
  transitionChannelCount?: number
  rootSrc?: string
  darkParticleCount: number
}

/**
 * Renderer-owned visibility gates used by the Visual playground. They never
 * rewrite manifestation coordinates, ownership, scale or identity.
 */
export type BulkVisualLayer =
  | "atom"
  | "matter"
  | "field"
  | "state"
  | "causal"
  | "transition"
  | "field-proxy"
  | "relation"
  | "label"
  | "grid"

export interface BulkViewportController {
  dispose(): void
  handleForce(_channel: string, _message: unknown): void
  setSize(width: number, height: number): void
  setVisualLayers(layers: readonly BulkVisualLayer[] | null): void
}

export type BulkViewportOptions = {
  canvas: HTMLCanvasElement
  height: number
  onStats?: (stats: BulkViewportStats) => void
  visualLayers?: readonly BulkVisualLayer[]
  width: number
}

export type HoverablePickTarget = BulkPickTarget & {
  baseColor: Color
  baseRimColor: Color
  baseRimStrength: number
  baseOpacity: number
  material: ThinFilmMaterial
}

export type BulkViewPose = {
  position: Vector3
  target: Vector3
  up: Vector3
}

export type RestoredBulkViewPose = BulkViewPose & {
  rootFitLockedToViewport: boolean
}

export type StoredBulkViewPose = {
  href: string
  position: {x: number; y: number; z: number}
  rootFitLockedToViewport?: boolean
  target: {x: number; y: number; z: number}
  up: {x: number; y: number; z: number}
}

export type CanvasTouchTapState = {
  cancelled: boolean
  startX: number
  startY: number
  touchId: number
}

export type BulkWebkitFullscreenDocument = Document & {
  webkitCancelFullScreen?: () => Promise<void> | void
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenElement?: Element | null
}

export type BulkWebkitFullscreenElement = Element & {
  webkitRequestFullScreen?: () => Promise<void> | void
  webkitRequestFullscreen?: () => Promise<void> | void
}

export type ViewNavigationState = {
  fallbackFitPoints: Vector3[]
  fallbackFitRadius: number
  fallbackTarget: Vector3
  startedAt: number | null
  startPose: BulkViewPose
  targetKey: string | null
}

export type DarkParticleRenderRecord = {
  container: Object3D
  currentTransitionScale: number
  material: ThinFilmMaterial
  pickTarget: HoverablePickTarget
  snapshot: BulkReadyRenderDarkParticle
  targetLocalPosition: Vector3
  torus: Mesh
}

export type FieldParticleRenderRecord = {
  currentTransitionScale: number
  depth: number
  material: ThinFilmMaterial
  node: Mesh
  parentDarkParticleId: number
  pickTarget: HoverablePickTarget
  snapshot: BulkReadyRenderFieldParticle
  targetLocalPosition: Vector3
}

export type FadingRemovalRecord = {
  baseOpacity: number
  durationMs: number
  initialScale: Vector3
  material: {opacity: number}
  object: Object3D
  startedAtMs: number
}

export type SurfaceLabelVisual = {
  container: Object3D
  coverCenterX: number
  extents: TextExtents
  initialCoverPositions: Float32Array
  initialStencilPositions: Float32Array
  material: TextMaterial
  stencilCenterX: number
  textNode: Text
}

export type LabelRenderRecord = {
  anchorObject: Object3D
  bentCurveRadius: number
  bentScale: number
  container: Object3D
  coverCenterX: number
  currentOpacity: number
  currentScale: number
  extents: TextExtents
  initialCoverPositions: Float32Array
  initialStencilPositions: Float32Array
  key: string
  layer: BulkVisualLayer
  material: TextMaterial
  offset: number
  torusRadius: number
  torusTube: number
  signature: string
  stencilCenterX: number
  textNode: Text
}

export type LabelSpec = {
  anchorObject: Object3D
  color: Color
  depth: number
  fontSize: number
  key: string
  layer: BulkVisualLayer
  offset: number
  torusRadius: number
  torusTube: number
  text: string
}

export type FadingLabelRemovalRecord = {
  durationMs: number
  initialOpacity: number
  initialScale: Vector3
  material: TextMaterial
  object: Object3D
  startedAtMs: number
}
