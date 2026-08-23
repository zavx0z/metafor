import type { BufferGeometry, Text, TextMaterial, TrueTypeFont } from "@metafor/engine"

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
