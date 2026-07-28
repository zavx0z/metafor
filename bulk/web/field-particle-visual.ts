import type {BulkFieldParticle} from "@metafor/types/bulk/manifest"
import {resolveMarkerBubbleVisual} from "./marker-bubble-visual.ts"

type FieldParticleVisualInput = Pick<
	BulkFieldParticle,
	"colorB" | "colorG" | "colorR" | "fieldParticleId"
>

export type FieldParticleVisual = Readonly<{
	color: readonly [number, number, number, number]
	glowColor: readonly [number, number, number, number]
	glowIntensity: number
	luminanceBoost: number
	shimmerAmount: number
	shimmerPhase: number
	opacity: number
	visualScale: number
	visibilityMode: "scene" | "overlay"
}>

/**
 * Reuses the State bubble style while keeping dense type colors depth-tested,
 * so overlapping Fields cannot accumulate through the additive overlay pass.
 */
export const resolveFieldParticleVisual = (
	particle: FieldParticleVisualInput,
): FieldParticleVisual => {
	const bubble = resolveMarkerBubbleVisual({
		semanticColor: [particle.colorR, particle.colorG, particle.colorB],
		phaseIdentity: particle.fieldParticleId,
		colorBrightening: 0,
		glowBrightening: 0,
		visibilityMode: "scene",
	})
	return {
		...bubble,
		opacity: 1,
		visualScale: 1,
	}
}
