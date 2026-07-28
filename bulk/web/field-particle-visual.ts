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

/** Keeps dense nucleus markers opaque and type-colored without additive washout. */
export const resolveFieldParticleVisual = (
	particle: FieldParticleVisualInput,
): FieldParticleVisual => ({
	color: [particle.colorR, particle.colorG, particle.colorB, 1],
	glowColor: [particle.colorR, particle.colorG, particle.colorB, 0.1],
	glowIntensity: 0.8,
	luminanceBoost: 1,
	opacity: 1,
	visualScale: 1,
	visibilityMode: "scene",
})
