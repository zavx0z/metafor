export type SurfaceLabelScaleSpec =
  | {
      kind: "shell"
      offset: number
      shellRadius: number
      shellTube: number
    }
  | {
      kind: "field"
      offset: number
      sphereRadius: number
    }

export interface ResolveSurfaceLabelTextScaleOptions {
  maxUvLabelSpanRad: number
  minScale: number
}

export const resolveSurfaceLabelCurveRadius = (spec: SurfaceLabelScaleSpec): number => {
  if (spec.kind === "shell") {
    return Math.max(spec.shellRadius + spec.shellTube + spec.offset, 1e-6)
  }

  return Math.max(spec.sphereRadius + spec.offset, 1e-6)
}

export const resolveSurfaceLabelTextScale = (
  spec: SurfaceLabelScaleSpec,
  maxTextWidth: number,
  options: ResolveSurfaceLabelTextScaleOptions,
): number => {
  if (!(maxTextWidth > 0)) return 1

  const surfaceCurveRadius = resolveSurfaceLabelCurveRadius(spec)
  const maxSurfaceTextWidth = Math.max(1e-6, surfaceCurveRadius * options.maxUvLabelSpanRad)
  return Math.max(options.minScale, Math.min(1, maxSurfaceTextWidth / maxTextWidth))
}
