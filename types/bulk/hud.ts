import type { Object3D, Renderer } from "@metafor/engine"
import type {
  UiSurface,
  UiSurfaceLayoutFn,
  UiSurfaceLayerOpts,
  UiSurfaceNode,
  UiSurfaceRect,
  VirtualInput,
} from "@ui/elements"
import type { BulkFieldParticle } from "./manifest.ts"
import type { BulkLayoutSettings, BulkRenderSettings } from "./settings.ts"
import type {
  BotPhoneDisplayRect,
  BotPhoneHudQuad,
  BotPhoneScreenTarget,
  BulkViewportController,
  BulkViewportStats,
} from "./viewport.ts"

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

export type BulkViewportWithHud = BulkViewportController & {
  readonly hud: BulkViewportHudController
}

export type BotPhoneScreenFrame = {
  bounds: UiSurfaceRect
  displayRect: BotPhoneDisplayRect
  displaySizePx: number
  quad: BotPhoneHudQuad
  target: BotPhoneScreenTarget
}

export type BotPhoneDisplayDockControl = {
  fullscreenButton: UiSurfaceRect
  hit: UiSurfaceRect
  returnButton: UiSurfaceRect
}

export type FieldParticleBillboardMode = "summary" | "surface"

export type FieldParticleBillboardSurfaceControl = UiSurface & {
  setField(field: BulkFieldParticle): void
  setMode(mode: FieldParticleBillboardMode): void
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

export type BulkHudSettingsSnapshot = {
  layoutSettings: Partial<BulkLayoutSettings>
  renderSettings: Partial<BulkRenderSettings>
}

export type BulkHudOptions = {
  viewport: BulkViewportWithHud
  initialSrc: string
  initialSettings: BulkHudSettingsSnapshot
  onApply(src: string, settings: BulkHudSettingsSnapshot): void
  onRenderSettingsChange(settings: Partial<BulkRenderSettings>): void
  onSettingsPersist(settings: BulkHudSettingsSnapshot): void
}

export type BulkHudController = {
  currentSrc(): string
  relayout(): void
  setBusy(busy: boolean): void
  setConnectionStatus(online: boolean): void
  setStats(stats: BulkViewportStats): void
  settingsSnapshot(): BulkHudSettingsSnapshot
}

export type SettingsTab = "scene" | "geometry" | "render"
export type DockButtonKind = "settings" | "fullscreen"
export type SettingsPanelState = {open?: boolean; tab?: SettingsTab; scroll?: Partial<Record<SettingsTab, number>>}
