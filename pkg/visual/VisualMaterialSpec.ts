export type VisualRgb = readonly [number, number, number]
export type VisualRgba = readonly [number, number, number, number]

export type VisualQuantumMaterial = Readonly<{
  color: VisualRgb
  form: "sphere" | "torus"
  glowIntensity: number
  highlightSize: number
  kind: "quantum"
  opacity: number
}>

export type VisualLineMaterial = Readonly<{
  color: VisualRgba
  glowColor: VisualRgba
  glowIntensity: number
  kind: "line-glow"
  opacity: number
  visibilityMode: "scene" | "overlay"
}>

const freezeRgb = (color: VisualRgb): VisualRgb =>
  Object.freeze([...color]) as VisualRgb

const freezeRgba = (color: VisualRgba): VisualRgba =>
  Object.freeze([...color]) as VisualRgba

const quantum = (
  form: VisualQuantumMaterial["form"],
  color: VisualRgb,
  glowIntensity: number,
  opacity: number,
): VisualQuantumMaterial => Object.freeze({
  color: freezeRgb(color),
  form,
  glowIntensity,
  highlightSize: form === "sphere" ? 1 : 0,
  kind: "quantum",
  opacity,
})

export const visualContextTorusMaterial = (
  color: VisualRgb,
): VisualQuantumMaterial => quantum("torus", color, 1.2, 0.3)

export const visualCoreFieldMaterial = (
  color: VisualRgb,
): VisualQuantumMaterial => quantum("sphere", color, 2.8, 0.72)

export const visualStateTorusMaterial = (
  color: VisualRgb,
  current: boolean,
): VisualQuantumMaterial =>
  quantum("torus", color, current ? 4.6 : 3, current ? 0.82 : 0.64)

export const visualConditionFieldMaterial = (
  color: VisualRgb,
  current: boolean,
): VisualQuantumMaterial =>
  quantum("sphere", color, current ? 5.2 : 3.4, current ? 0.78 : 0.66)

export const visualCausalMaterial = (
  color: VisualRgb,
  current: boolean,
  active: boolean,
): VisualQuantumMaterial => quantum(
  "sphere",
  color,
  current ? 1.9 : active ? 1.15 : 0.42,
  current ? 0.82 : active ? 0.5 : 0.16,
)

export const visualFieldProxyMaterial = (
  color: VisualRgb,
  form: VisualQuantumMaterial["form"],
  active: boolean,
): VisualQuantumMaterial =>
  quantum(form, color, active ? 1.4 : 0.4, active ? 0.5 : 0.14)

export const visualTransitionMaterial = (
  returning: boolean,
): VisualLineMaterial => Object.freeze({
  color: freezeRgba(
    returning
      ? [1, 0.55, 0.22, 0.9]
      : [0.28, 0.78, 1, 0.82],
  ),
  glowColor: freezeRgba(
    returning
      ? [1, 0.39, 0.12, 0.36]
      : [0.45, 0.9, 1, 0.28],
  ),
  glowIntensity: 1.65,
  kind: "line-glow",
  opacity: 1,
  visibilityMode: "scene",
})

export const visualRelationMaterial = (
  color: VisualRgb,
  active: boolean,
): VisualLineMaterial => Object.freeze({
  color: freezeRgba([...color, active ? 0.78 : 0.006]),
  glowColor: freezeRgba([...color, active ? 0.26 : 0]),
  glowIntensity: active ? 1.9 : 0.05,
  kind: "line-glow",
  opacity: 1,
  visibilityMode: "scene",
})
