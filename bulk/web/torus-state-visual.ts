import type {BulkOrbitalParticle} from "@metafor/types/bulk/manifest"

type TorusStateVisualInput = Pick<
	BulkOrbitalParticle,
	"active" | "colorB" | "colorG" | "colorR" | "current" | "orbitalParticleId"
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

const TAU = Math.PI * 2

const brighten = (channel: number, strength: number): number =>
	channel + (1 - channel) * strength

const brightenColor = (
	particle: TorusStateVisualInput,
	strength: number,
	alpha: number,
): readonly [number, number, number, number] => [
	brighten(particle.colorR, strength),
	brighten(particle.colorG, strength),
	brighten(particle.colorB, strength),
	alpha,
]

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
	if (particle.current) {
		return {
			color: brightenColor(particle, 0.64, 1),
			glowColor: brightenColor(particle, 0.88, 0.9),
			glowIntensity: 4.8,
			luminanceBoost: 1.45,
			shimmerAmount: 0.13,
			shimmerPhase: resolveStatePhase(particle),
			visibilityMode: "scene",
		}
	}
	if (particle.active) {
		return {
			color: brightenColor(particle, 0.28, 0.5),
			glowColor: brightenColor(particle, 0.48, 0.4),
			glowIntensity: 2.4,
			luminanceBoost: 1.1,
			shimmerAmount: 0.065,
			shimmerPhase: resolveStatePhase(particle),
			visibilityMode: "overlay",
		}
	}
	return {
		color: [particle.colorR, particle.colorG, particle.colorB, 0.14],
		glowColor: [particle.colorR, particle.colorG, particle.colorB, 0.04],
		glowIntensity: 0.3,
		luminanceBoost: 1.05,
		shimmerAmount: 0,
		shimmerPhase: resolveStatePhase(particle),
		visibilityMode: "overlay",
	}
}
