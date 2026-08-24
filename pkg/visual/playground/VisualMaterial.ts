import {
  Color,
  LineGlowMaterial,
  type ThinFilmMaterial,
} from "@engine/core"
import {
  createQuantumFilmMaterial,
  createQuantumSphereMaterial,
} from "./QuantumFilm.ts"
import type {
  VisualLineMaterial,
  VisualQuantumMaterial,
} from "../src/VisualMaterialSpec.ts"

export {
  VISUAL_INACTIVE_STATE_BRANCH_OPACITY,
  visualCausalMaterial,
  visualConditionFieldMaterial,
  visualContextTorusMaterial,
  visualCoreFieldMaterial,
  visualFieldProxyMaterial,
  visualProcessTorusMaterial,
  visualRelationMaterial,
  visualStateTorusMaterial,
  visualTransitionMaterial,
  type VisualLineMaterial,
  type VisualQuantumMaterial,
  type VisualRgb,
  type VisualRgba,
} from "../src/VisualMaterialSpec.ts"

export const createVisualQuantumMaterial = (
  spec: VisualQuantumMaterial,
): ThinFilmMaterial => {
  const color = new Color(...spec.color)
  const options = {
    glowIntensity: spec.glowIntensity,
    opacity: spec.opacity,
  }
  return spec.form === "sphere"
    ? createQuantumSphereMaterial(color, options)
    : createQuantumFilmMaterial(color, {
        ...options,
        highlightSize: spec.highlightSize,
      })
}

export const applyVisualQuantumMaterial = (
  target: ThinFilmMaterial,
  spec: VisualQuantumMaterial,
): void => {
  const source = createVisualQuantumMaterial(spec)
  target.color.copy(source.color)
  target.rimColor.copy(source.rimColor)
  target.opacity = source.opacity
  target.rimStrength = source.rimStrength
  target.iridescence = source.iridescence
  target.filmThickness = source.filmThickness
  target.highlightSize = source.highlightSize
}

export const createVisualLineMaterial = (
  spec: VisualLineMaterial,
): LineGlowMaterial => new LineGlowMaterial({
  color: new Color(...spec.color),
  glowColor: new Color(...spec.glowColor),
  glowIntensity: spec.glowIntensity,
  opacity: spec.opacity,
  visibilityMode: spec.visibilityMode,
})

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
