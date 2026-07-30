import {
  Color,
  LineGlowMaterial,
  type ThinFilmMaterial,
} from "@metafor/engine"
import {
  createQuantumFilmMaterial,
  createQuantumSphereMaterial,
} from "./QuantumFilm.ts"
import type {
  VisualLineMaterial,
  VisualQuantumMaterial,
} from "./VisualMaterialSpec.ts"

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
} from "./VisualMaterialSpec.ts"

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
