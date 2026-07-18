export interface BulkLayoutSettings {
  orbitEdgeGapMm: number
  rootInnerDiameterMm: number
  rootSphereRadiusMm: number
}

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
  layout: BulkLayoutSettings
  render: BulkRenderSettings
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
