import type { BulkLayoutSettings } from "@bulk/gravity/layout"

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

export type PersistedSettingsRecord = SettingsSnapshot & {
  id: string
  revision: number
}
