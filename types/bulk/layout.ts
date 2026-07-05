import type {
  BufferGeometry,
  Color,
  LineGlowMaterial,
  LineSegments,
  Object3D,
  Renderer,
  Text,
  TextMaterial,
  TrueTypeFont,
  Vector3,
} from "@metafor/engine"
import type {
  UiSurface,
  UiSurfaceLayoutFn,
  UiSurfaceLayerOpts,
  UiSurfaceNode,
  UiSurfaceRect,
  VirtualInput,
} from "@ui/elements"
import type { BulkDarkParticle, BulkDarkParticleInput, BulkFieldParticle, BulkFieldParticleInput, BulkManifest } from "./manifest.ts"
import type { LevelDetail, LevelGeometry, LevelLabel } from "./level.ts"
import type { BulkRenderSettings } from "./settings.ts"

export interface BulkLayoutSettings {
  orbitEdgeGapMm: number
  rootInnerDiameterMm: number
  rootSphereRadiusMm: number
}

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

export interface FontMetrics {
  unitsPerEm: number
  ascent: number
  descent: number
  lineGap: number
}

export interface TextExtents {
  widthMm: number
  minXmm: number
  centerXmm: number
  ascenderMm: number
  descenderMm: number
}

export interface SurfaceArcLimits {
  horizontalRad: number
}

export interface ResolveSurfaceFitScaleOptions {
  curveRadiusMm: number
  extents: TextExtents
  limits: SurfaceArcLimits
  minScale: number
}

export interface BendTextAroundEquatorOptions {
  geometry: BufferGeometry
  initialPositions: Float32Array
  centerX: number
  scale: number
  curveRadius: number
}

export interface SurfaceLabel {
  textNode: Text
  fontMetrics: FontMetrics
  extents: TextExtents
  initialStencilPositions: Float32Array
  initialCoverPositions: Float32Array
  stencilCenterX: number
  coverCenterX: number
  fontSize: number
}

export interface CreateSurfaceLabelOptions {
  text: string
  font: TrueTypeFont
  baseFontSize: number
  material: TextMaterial
  curveRadiusMm: number
  limits: SurfaceArcLimits
  minScale: number
}

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
  applyManifest(manifest: BulkManifest): void
  readonly hud: BulkViewportHudController
}

export interface BulkViewportHudController {
  readonly canvas: HTMLCanvasElement
  readonly renderer: Renderer
  readonly inputProxy: VirtualInput | null
  addSurface(surface: UiSurfaceNode, layout: UiSurfaceLayoutFn, opts?: UiSurfaceLayerOpts): void
  clearSurfaceRect(surface: UiSurfaceNode): void
  relayout(): void
  requestRender(): void
  setFocused(surface: UiSurfaceNode | null): void
  setSurfaceRect(surface: UiSurfaceNode, rect: UiSurfaceRect): UiSurfaceRect | null
  surfaceFrame(surface: UiSurfaceNode): {rect: UiSurfaceRect; bounds: {w: number; h: number}} | null
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

export type BotPhoneScreenFrame = {
  bounds: UiSurfaceRect
  displayRect: BotPhoneDisplayRect
  displaySizePx: number
  quad: BotPhoneHudQuad
  target: BotPhoneScreenTarget
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

export type BotPhoneDisplayDockControl = {
  fullscreenButton: UiSurfaceRect
  hit: UiSurfaceRect
  returnButton: UiSurfaceRect
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

export type FieldParticleBillboardRecord = {
  anchorObject: Object3D
  container: Object3D
  fieldParticleId: number
  heightMm: number
  pixelScale: number
  signature: string
  surface: FieldParticleBillboardSurfaceControl
  widthMm: number
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

export type FieldParticleBillboardMode = "summary" | "surface"

export type FieldParticleBillboardSurfaceControl = UiSurface & {
  setField(field: BulkFieldParticle): void
  setMode(mode: FieldParticleBillboardMode): void
}

export type BulkHudSurfaceSlot = {
  surface: UiSurfaceNode
  layout: UiSurfaceLayoutFn
  rect: UiSurfaceRect
  rectOverride?: UiSurfaceRect
  pixelScale?: number
  order: number
  windowZIndex: number
  zIndex: number
  windowId: string | null
  windowOrder: number
}
