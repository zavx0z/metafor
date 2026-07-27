import type {BulkFieldParticle} from "@metafor/types/bulk/manifest"

type FieldParticleVisualInput = Pick<
	BulkFieldParticle,
	"colorB" | "colorG" | "colorR"
>

export type FieldParticleVisual = Readonly<{
	color: readonly [number, number, number, number]
	glowColor: readonly [number, number, number, number]
	glowIntensity: number
	luminanceBoost: number
	opacity: number
	visualScale: number
	visibilityMode: "scene" | "overlay"
}>

const brighten = (channel: number): number =>
	channel + (1 - channel) * 0.7

/**
 * Uses existing nested-Atom Field spheres as bounded red nucleus accents.
 * Depth 1 belongs to the root Atom nucleus; deeper Fields belong to the inner core.
 */
export const resolveFieldParticleVisual = (
	particle: FieldParticleVisualInput,
	depth: number,
	wireframeOpacity: number,
): FieldParticleVisual => {
	if (depth > 1) {
		return {
			color: [1, 0.12, 0.08, 0.68],
			glowColor: [1, 0.34, 0.16, 0.5],
			glowIntensity: 2.2,
			luminanceBoost: 1.25,
			opacity: 0.85,
			visualScale: 0.38,
			visibilityMode: "overlay",
		}
	}

	return {
		color: [particle.colorR, particle.colorG, particle.colorB, 1],
		glowColor: [
			brighten(particle.colorR),
			brighten(particle.colorG),
			brighten(particle.colorB),
			0.1,
		],
		glowIntensity: 0.8,
		luminanceBoost: 1,
		opacity: Math.min(1, Math.max(0, wireframeOpacity * 0.9)),
		visualScale: 1,
		visibilityMode: "scene",
	}
}
