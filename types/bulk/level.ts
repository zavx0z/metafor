export interface LevelGeometrySettings {
  rootInnerDiameterMm: number
  rootSphereRadiusMm: number
  rootOuterDiameterMm: number
  nestingCoefficient: number
  packingDensityCoefficient: number
  sphereMinScaleFactor: number
}

export interface LevelDetailSettings {
  detailDensityFactor: number
  detailLevelMultiplier: number
  torusRadialSegments: number
  torusTubularSegments: number
  torusMaxSegments: number
  sphereBaseWidthSegments: number
  sphereBaseHeightSegments: number
  sphereMaxWidthSegments: number
  sphereMaxHeightSegments: number
}

export interface LevelLabelSettings {
  baseDepth: number
  fontSizeMm: number
  surfaceOffsetMm: number
  visibleLevels: number
}

export interface LevelSettings {
  geometry: LevelGeometrySettings
  detail: LevelDetailSettings
  label: LevelLabelSettings
}

export interface LevelDetail {
  depth: number
  detailMultiplier: number
  torusRadialSegments: number
  torusTubularSegments: number
  sphereWidthSegments: number
  sphereHeightSegments: number
}

export interface LevelGeometry {
  depth: number
  levelScale: number
  outerDiameterMm: number
  outerRadiusMm: number
  innerDiameterMm: number
  innerRadiusMm: number
  torusRadiusMm: number
  torusTubeMm: number
  thicknessMm: number
  workingThicknessMm: number
  paddingMm: number
  maxObjectDiameterMm: number
  sphereDiameterMm: number
  sphereRadiusMm: number
  sphereMinDiameterMm: number
  sphereMaxDiameterMm: number
  nestingCoefficient: number
  packingDensityCoefficient: number
}

export interface ResolveLevelGeometryOptions {
  depth: number
  settings: LevelGeometrySettings
  outerRadiusMm?: number
}

export interface LevelLabel {
  depth: number
  isVisible: boolean
  fontSizeMm: number
  surfaceOffsetMm: number
}

export interface LevelResolver {
  getGeometry(depth: number, outerRadiusMm?: number): LevelGeometry
  getDetail(depth: number): LevelDetail
  getLabel(depth: number): LevelLabel
  invalidate(): void
}
