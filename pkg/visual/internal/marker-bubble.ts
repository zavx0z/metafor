export type MarkerBubbleVisual = Readonly<{
  color: readonly [number, number, number, number]
  glowColor: readonly [number, number, number, number]
  glowIntensity: number
  luminanceBoost: number
  shimmerAmount: number
  shimmerPhase: number
  visibilityMode: "scene" | "overlay"
}>

type MarkerBubbleVisualInput = Readonly<{
  semanticColor: readonly [number, number, number]
  phaseIdentity: string
  colorBrightening?: number
  glowBrightening?: number
  visibilityMode?: "scene" | "overlay"
}>

const TAU = Math.PI * 2

const brighten = (channel: number, strength: number): number =>
  channel + (1 - channel) * strength

const withAlpha = (
  color: readonly [number, number, number],
  brightening: number,
  alpha: number,
): readonly [number, number, number, number] => [
  brighten(color[0], brightening),
  brighten(color[1], brightening),
  brighten(color[2], brightening),
  alpha,
]

/** Stable spatial phase for the shared sphere-marker bubble style. */
export const resolveMarkerBubblePhase = (identity: string): number => {
  let hash = 2_166_136_261
  for (let index = 0; index < identity.length; index++) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return ((hash >>> 0) / 0x1_0000_0000) * TAU
}

/** Shared translucent shell, colored glow and bounded spatial shimmer. */
export const resolveMarkerBubbleVisual = (
  input: MarkerBubbleVisualInput,
): MarkerBubbleVisual => ({
  color: withAlpha(
    input.semanticColor,
    input.colorBrightening ?? 0.28,
    0.5,
  ),
  glowColor: withAlpha(
    input.semanticColor,
    input.glowBrightening ?? 0.48,
    0.4,
  ),
  glowIntensity: 2.4,
  luminanceBoost: 1.1,
  shimmerAmount: 0.065,
  shimmerPhase: resolveMarkerBubblePhase(input.phaseIdentity),
  visibilityMode: input.visibilityMode ?? "overlay",
})
