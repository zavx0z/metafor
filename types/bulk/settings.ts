import type { BulkLayoutSettings } from "./layout.ts"
import type { BulkViewportController, BulkViewportStats } from "./layout.ts"

export interface BulkRenderSettings {
  animationEnabled: boolean
  detailDensityFactor: number
  detailLevelMultiplier: number
  labelVisibleLevels: number
  baseDepth: number
  labelFontSizeMm: number
  labelSurfaceOffsetMm: number
  torusCrossRingRotationDeg: number
  torusRadialSegments: number
  torusTubularSegments: number
  wireframeOpacity: number
}

export interface BulkSettingsConfig {
  src: string
  layout: BulkLayoutSettings
  render: BulkRenderSettings
}

export interface SettingsSnapshot {
  src: string
  layoutSettings: Partial<BulkLayoutSettings>
  renderSettings: Partial<BulkRenderSettings>
}

export interface SettingsIndexedDbOptions {
  databaseName?: string
  indexedDb?: IDBFactory
}

export interface PersistedSettingsRecord extends SettingsSnapshot {
  id: string
  revision: number
}

export interface BulkLayoutConfig {
  viewport: {
    axesSizeMm: number
    camera: {
      far: number
      fovRad: number
      near: number
      position: { x: number; y: number; z: number }
      target: { x: number; y: number; z: number }
    }
    grid: {
      centerColorHex: number
      colorHex: number
      divisions: number
      sizeMm: number
    }
    levelsMm: {
      eye: number
      elbow: number
      floor: number
    }
    torusFallbackMm: {
      radius: number
      tube: number
    }
  }
}

export type BulkSettingSection = "layout" | "render"
export type BulkSettingGroup = "animation" | "detail" | "geometry" | "labels" | "torus"
export type BulkLayoutSettingKey = keyof BulkLayoutSettings
export type BulkRenderSettingKey = keyof BulkRenderSettings
export type BulkSettingKey = BulkLayoutSettingKey | BulkRenderSettingKey

export interface BulkSettingConfig {
  defaultValue: boolean | number
  description: string
  group: BulkSettingGroup
  label: string
  max?: number
  min?: number
  section: BulkSettingSection
  step?: number
  type?: "checkbox" | "range"
}

export type BulkHudSettingsSnapshot = {
  layoutSettings: Partial<BulkLayoutSettings>
  renderSettings: Partial<BulkRenderSettings>
}

export type BulkHudOptions = {
  viewport: BulkViewportController
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
