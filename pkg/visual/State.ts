import type {BulkOrbitalParticle} from "@metafor/types/bulk/manifest"
import {defineVisualComponent} from "./internal/component.ts"
import {
  resolveMarkerBubblePhase,
  resolveMarkerBubbleVisual,
} from "./internal/marker-bubble.ts"

type TorusStateVisualInput = Pick<
  BulkOrbitalParticle,
  "active" | "current" | "orbitalParticleId" | "sourceId"
>

export type TorusStateVisual = Readonly<{
  color: readonly [number, number, number, number]
  glowColor: readonly [number, number, number, number]
  glowIntensity: number
  luminanceBoost: number
  shimmerAmount: number
  shimmerPhase: number
  visibilityMode: "scene" | "overlay"
}>

export const State = defineVisualComponent({
  entity: "State",
  slug: "state",
  description: "Один канонический State marker.",
  selection: "first-state",
  layers: ["state", "label", "grid"],
})

const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) / 2

const hueChannel = (p: number, q: number, input: number): number => {
  let hue = input
  if (hue < 0) hue += 1
  if (hue > 1) hue -= 1
  if (hue < 1 / 6) return p + (q - p) * 6 * hue
  if (hue < 1 / 2) return q
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6
  return p
}

/** Stable semantic hue keyed only by canonical State identity. */
export const resolveSemanticStateColor = (
  sourceId: number,
): readonly [number, number, number] => {
  const product = Math.abs(sourceId) * GOLDEN_RATIO_CONJUGATE
  const hue = product - Math.floor(product)
  const saturation = 0.72
  const lightness = 0.56
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  return [
    hueChannel(p, q, hue + 1 / 3),
    hueChannel(p, q, hue),
    hueChannel(p, q, hue - 1 / 3),
  ]
}

const brightenColor = (
  color: readonly [number, number, number],
  strength: number,
  alpha: number,
): readonly [number, number, number, number] => [
  color[0] + (1 - color[0]) * strength,
  color[1] + (1 - color[1]) * strength,
  color[2] + (1 - color[2]) * strength,
  alpha,
]

const resolveStatePhase = (particle: TorusStateVisualInput): number =>
  resolveMarkerBubblePhase(
    `${particle.orbitalParticleId}:${particle.current ? 1 : 0}:${particle.active ? 1 : 0}`,
  )

export const resolveTorusStateVisual = (
  particle: TorusStateVisualInput,
): TorusStateVisual => {
  const semanticColor = resolveSemanticStateColor(particle.sourceId)
  if (particle.current) {
    return {
      color: brightenColor(semanticColor, 0.64, 1),
      glowColor: brightenColor(semanticColor, 0.88, 0.9),
      glowIntensity: 4.8,
      luminanceBoost: 1.45,
      shimmerAmount: 0.13,
      shimmerPhase: resolveStatePhase(particle),
      visibilityMode: "scene",
    }
  }
  if (particle.active) {
    return resolveMarkerBubbleVisual({
      semanticColor,
      phaseIdentity: `${particle.orbitalParticleId}:${particle.current ? 1 : 0}:${particle.active ? 1 : 0}`,
    })
  }
  return {
    color: [...semanticColor, 0.14],
    glowColor: [...semanticColor, 0.04],
    glowIntensity: 0.3,
    luminanceBoost: 1.05,
    shimmerAmount: 0,
    shimmerPhase: resolveStatePhase(particle),
    visibilityMode: "overlay",
  }
}
