import type {BulkOrbitalParticle} from "@metafor/types/bulk/manifest"

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

export type PotentialMarkerReadability = Pick<
	TorusStateVisual,
	"color" | "glowColor" | "glowIntensity" | "luminanceBoost" | "visibilityMode"
>

const TAU = Math.PI * 2
const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) / 2

const brighten = (channel: number, strength: number): number =>
	channel + (1 - channel) * strength

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
	brighten(color[0], strength),
	brighten(color[1], strength),
	brighten(color[2], strength),
	alpha,
]

/** Shared readable marker class used by potential State and semantic Fields. */
export const resolvePotentialMarkerReadability = (
	semanticColor: readonly [number, number, number],
): PotentialMarkerReadability => ({
	color: brightenColor(semanticColor, 0.28, 0.5),
	glowColor: brightenColor(semanticColor, 0.48, 0.4),
	glowIntensity: 2.4,
	luminanceBoost: 1.1,
	visibilityMode: "overlay",
})

/**
 * Stable spatial phase which changes only with the projected current/active state.
 * It gives the GPU pattern a new facet on a real state change without a CPU clock.
 */
const resolveStatePhase = (particle: TorusStateVisualInput): number => {
	const key = `${particle.orbitalParticleId}:${particle.current ? 1 : 0}:${particle.active ? 1 : 0}`
	let hash = 2_166_136_261
	for (let index = 0; index < key.length; index++) {
		hash ^= key.charCodeAt(index)
		hash = Math.imul(hash, 16_777_619)
	}
	return ((hash >>> 0) / 0x1_0000_0000) * TAU
}

/**
 * Material contrast for the existing State markers carried by a Capsule torus.
 * Current and potential remain the same projection states; only readability changes.
 */
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
		return {
			...resolvePotentialMarkerReadability(semanticColor),
			shimmerAmount: 0.065,
			shimmerPhase: resolveStatePhase(particle),
		}
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
