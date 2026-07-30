export interface BulkRenderSettings {
  labelVisibleLevels: number
  baseDepth: number
  labelFontSizeMm: number
  labelSurfaceOffsetMm: number
}

export interface BulkSettingsConfig {
  render: BulkRenderSettings
}

export interface BulkViewportConfig {
  viewport: {
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
      elbow: number
      floor: number
    }
  }
}
