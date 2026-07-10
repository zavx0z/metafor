import type { Color, LineGlowMaterial, LineSegments, Object3D, Text, TextMaterial, Vector3 } from "@metafor/engine"
import type { BulkDarkParticle, BulkFieldParticle, BulkManifest } from "./manifest.ts"
import type { BulkLayoutSettings, BulkRenderSettings } from "./settings.ts"
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
  fieldParticleId: number
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
  rootSrc?: string
  darkParticleCount: number
}

export interface BulkViewportController {
  dispose(): void
  handleForce(_channel: string, _message: unknown): void
  setAnimationSuspended(suspended: boolean): void
  setLayoutSettings(settings: Partial<BulkLayoutSettings>): void
  setRenderSettings(settings: Partial<BulkRenderSettings>): void
  setSize(width: number, height: number): void
  /** Applies a manifest diff while retaining all unchanged render records. */
  applyManifestPatch(manifest: BulkManifest): void
}

export type BulkAndroidFrameSize = {
  height: number
  width: number
}

export type BulkAndroidControlCommand =
  | {type: "tap"; x: number; y: number; frameW?: number; frameH?: number}
  | {type: "swipe"; x1: number; y1: number; x2: number; y2: number; durationMs?: number; frameW?: number; frameH?: number}
  | {type: "key"; code: string}
  | {type: "launch"; packageName: string}

export type BulkViewportOptions = {
  androidFrameSize?: () => BulkAndroidFrameSize | null
  canvas: HTMLCanvasElement
  height: number
  onAndroidControl?: (command: BulkAndroidControlCommand) => boolean
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

export type BotPhoneScreenTarget = {
  phone: Object3D
  screen: Object3D
  screenH: number
  screenW: number
}

export type BotPhoneDisplayRect = {
  h: number
  w: number
  x: number
  y: number
}

export type BotFloorPhones = {
  root: Object3D
  screens: BotPhoneScreenTarget[]
}

export type BotPhoneScreenHit = {
  androidX: number
  androidY: number
  distance: number
  frameH: number
  frameW: number
  localX: number
  localY: number
  target: BotPhoneScreenTarget
}

export type BotPhoneHudPoint = {
  x: number
  y: number
}

export type BotPhoneHudQuad = {
  bottomLeft: BotPhoneHudPoint
  bottomRight: BotPhoneHudPoint
  topLeft: BotPhoneHudPoint
  topRight: BotPhoneHudPoint
}

export type BotPhoneGesture = {
  current: BotPhoneScreenHit
  start: BotPhoneScreenHit
  startClientX: number
  startClientY: number
  startedAt: number
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

export type BotPhoneViewState = {
  returnPose: BulkViewPose
  target: BotPhoneScreenTarget
}

export type BotPhoneCameraFlight = {
  end: BulkViewPose
  start: BulkViewPose
  startedAt: number
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
  kind: "darkParticle" | "fieldParticle"
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
  kind: "darkParticle" | "fieldParticle"
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
