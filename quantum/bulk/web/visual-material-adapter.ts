import {
  Color,
  LineGlowMaterial,
  ThinFilmMaterial,
} from "@engine/core"
import type {
  VisualLineMaterial,
  VisualQuantumMaterial,
} from "@metafor/visual"

const quantumPalette = (
  color: Color,
  opacity: number,
): Readonly<{film: Color; glow: Color}> => ({
  film: new Color(
    color.r * 0.42,
    color.g * 0.42,
    color.b * 0.42,
    opacity,
  ),
  glow: new Color(
    color.r + (1 - color.r) * 0.16,
    color.g + (1 - color.g) * 0.16,
    color.b + (1 - color.b) * 0.16,
  ),
})

/** Bulk-owned adapter from a declarative Visual skin to an Engine material. */
export const createVisualQuantumMaterial = (
  spec: VisualQuantumMaterial,
): ThinFilmMaterial => {
  const palette = quantumPalette(new Color(...spec.color), spec.opacity)
  return new ThinFilmMaterial({
    color: palette.film,
    rimColor: palette.glow,
    filmThickness: 0.88,
    iridescence: 0.86,
    opacity: spec.opacity,
    rimStrength: Math.min(4, 0.75 + spec.glowIntensity * 0.45),
    highlightSize: spec.highlightSize,
  })
}

/** Bulk-owned adapter from a declarative Visual line skin to Engine. */
export const createVisualLineMaterial = (
  spec: VisualLineMaterial,
): LineGlowMaterial => new LineGlowMaterial({
  color: new Color(...spec.color),
  glowColor: new Color(...spec.glowColor),
  glowIntensity: spec.glowIntensity,
  opacity: spec.opacity,
  visibilityMode: spec.visibilityMode,
})

/** Applies a declarative Visual line-skin update without replacing its GPU material. */
export const applyVisualLineMaterial = (
  target: LineGlowMaterial,
  spec: VisualLineMaterial,
): void => {
  target.color.setRGBA(...spec.color)
  target.glowColor?.setRGBA(...spec.glowColor)
  target.glowIntensity = spec.glowIntensity
  target.opacity = spec.opacity
  target.visibilityMode = spec.visibilityMode
}
