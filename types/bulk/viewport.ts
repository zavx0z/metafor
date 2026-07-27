import type { Color, LineGlowMaterial, LineSegments, Object3D, Text, TextMaterial, Vector3 } from "@metafor/engine"
import type { BulkDarkParticle, BulkFieldParticle, BulkManifest } from "./manifest.ts"
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

export type BulkPickTarget = BulkDarkParticlePickTarget | BulkFieldParticlePickTarget

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

export interface BulkViewportController {
  dispose(): void
  handleForce(_channel: string, _message: unknown): void
  setAnimationSuspended(suspended: boolean): void
  setSize(width: number, height: number): void
  /** Applies a manifest diff while retaining all unchanged render records. */
  applyManifestPatch(manifest: BulkManifest): void
}

export type BulkViewportOptions = {
  canvas: HTMLCanvasElement
  height: number
  onStats?: (stats: BulkViewportStats) => void
  width: number
}

export type HoverablePickTarget = BulkPickTarget & {
  baseColor: Color
  baseGlowColor: Color | null
  baseGlowIntensity: number
  baseOpacity: number
  material: LineGlowMaterial
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
  baseTorusScale: number
  container: Object3D
  cosmosOrbitAngle: number
  currentTransitionScale: number
  markerShell: Object3D
  material: LineGlowMaterial
  pickTarget: HoverablePickTarget
  snapshot: BulkDarkParticle
  targetLocalPosition: Vector3
  torus: LineSegments
}

export type FieldParticleRenderRecord = {
  cosmosOrbitAngle: number
  currentTransitionScale: number
  depth: number
  material: LineGlowMaterial
  node: LineSegments
  parentDarkParticleId: number
  pickTarget: HoverablePickTarget
  snapshot: BulkFieldParticle
  targetLocalPosition: Vector3
}

export type FadingRemovalRecord = {
  baseOpacity: number
  durationMs: number
  initialScale: Vector3
  material: LineGlowMaterial
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
  container: Object3D
  coverCenterX: number
  currentOpacity: number
  currentScale: number
  extents: TextExtents
  initialCoverPositions: Float32Array
  initialStencilPositions: Float32Array
  key: string
  kind: "darkParticle" | "fieldParticle" | "orbitalParticle"
  material: TextMaterial
  offset: number
  torusRadius: number
  torusTube: number
  signature: string
  sphereRadius: number
  stencilCenterX: number
  textNode: Text
}

export type LabelSpec = {
  anchorObject: Object3D
  color: Color
  depth: number
  key: string
  kind: "darkParticle" | "fieldParticle" | "orbitalParticle"
  metricDepth: number
  metricRadius: number
  offset: number
  torusRadius: number
  torusTube: number
  sphereRadius: number
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
