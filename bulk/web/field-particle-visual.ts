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

/** Applies the same semantic Field material in every self-similar Atom. */
export const resolveFieldParticleVisual = (
	particle: FieldParticleVisualInput,
	wireframeOpacity: number,
): FieldParticleVisual => ({
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
	})
