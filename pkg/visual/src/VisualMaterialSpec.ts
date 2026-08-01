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

export const VISUAL_INACTIVE_STATE_BRANCH_OPACITY = 0.24

const stateBranchOpacity = (
  active: boolean,
  activeOpacity: number,
): number =>
  active ? activeOpacity : VISUAL_INACTIVE_STATE_BRANCH_OPACITY

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
  branchActive = true,
): VisualQuantumMaterial =>
  quantum(
    "torus",
    color,
    current ? 4.6 : 3,
    stateBranchOpacity(branchActive, current ? 0.82 : 0.64),
  )

export const visualConditionFieldMaterial = (
  color: VisualRgb,
  current: boolean,
  branchActive = true,
): VisualQuantumMaterial =>
  quantum(
    "sphere",
    color,
    current ? 5.2 : 3.4,
    stateBranchOpacity(branchActive, current ? 0.78 : 0.66),
  )

export const visualCausalMaterial = (
  color: VisualRgb,
  current: boolean,
  active: boolean,
  branchActive = true,
): VisualQuantumMaterial => quantum(
  "sphere",
  color,
  current ? 1.9 : active ? 1.15 : 0.42,
  stateBranchOpacity(
    branchActive,
    current ? 0.82 : active ? 0.5 : 0.16,
  ),
)

export const visualProcessTorusMaterial = (
  color: VisualRgb,
  current: boolean,
  active: boolean,
  branchActive = true,
): VisualQuantumMaterial => quantum(
  "torus",
  color,
  current ? 3.8 : active ? 2.4 : 0.7,
  stateBranchOpacity(
    branchActive,
    current ? 0.78 : active ? 0.58 : 0.24,
  ),
)

export const visualFieldProxyMaterial = (
  color: VisualRgb,
  form: VisualQuantumMaterial["form"],
  active: boolean,
  branchActive = true,
): VisualQuantumMaterial =>
  quantum(
    form,
    color,
    active ? 1.4 : 0.4,
    stateBranchOpacity(branchActive, active ? 0.5 : 0.14),
  )

export const visualTransitionMaterial = (
  returning: boolean,
  branchActive = true,
): VisualLineMaterial => Object.freeze({
  color: freezeRgba(
    branchActive
      ? returning
        ? [1, 0.55, 0.22, 0.9]
        : [0.28, 0.78, 1, 0.82]
      : returning
        ? [1, 0.55, 0.22, 1]
        : [0.28, 0.78, 1, 1],
  ),
  glowColor: freezeRgba(
    branchActive
      ? returning
        ? [1, 0.39, 0.12, 0.36]
        : [0.45, 0.9, 1, 0.28]
      : returning
        ? [1, 0.39, 0.12, 2 / 9]
        : [0.45, 0.9, 1, 2 / 9],
  ),
  glowIntensity: branchActive ? 1.65 : 0.45,
  kind: "line-glow",
  opacity: branchActive
    ? 1
    : VISUAL_INACTIVE_STATE_BRANCH_OPACITY,
  visibilityMode: "scene",
})

export const visualRelationMaterial = (
  color: VisualRgb,
  active: boolean,
  branchActive = active,
): VisualLineMaterial => Object.freeze({
  color: freezeRgba([
    ...color,
    branchActive ? active ? 0.78 : 0.18 : 1,
  ]),
  glowColor: freezeRgba([
    ...color,
    branchActive ? active ? 0.26 : 0.04 : 2 / 9,
  ]),
  glowIntensity: branchActive && active ? 1.9 : 0.45,
  kind: "line-glow",
  opacity: branchActive
    ? 1
    : VISUAL_INACTIVE_STATE_BRANCH_OPACITY,
  visibilityMode: "scene",
})
