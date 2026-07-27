import type {BulkOrbitalParticle} from "@metafor/types/bulk/manifest"

type TorusStateVisualInput = Pick<
	BulkOrbitalParticle,
	"active" | "colorB" | "colorG" | "colorR" | "current"
>

export type TorusStateVisual = Readonly<{
	color: readonly [number, number, number, number]
	glowColor: readonly [number, number, number, number]
	glowIntensity: number
}>

/**
 * Material contrast for the existing State markers carried by a Capsule torus.
 * Current and potential remain the same projection states; only readability changes.
 */
export const resolveTorusStateVisual = (
	particle: TorusStateVisualInput,
): TorusStateVisual => {
	if (particle.current) {
		return {
			color: [particle.colorR, particle.colorG, particle.colorB, 0.96],
			glowColor: [particle.colorR, particle.colorG, particle.colorB, 0.48],
			glowIntensity: 2.8,
		}
	}
	if (particle.active) {
		return {
			color: [particle.colorR, particle.colorG, particle.colorB, 0.58],
			glowColor: [particle.colorR, particle.colorG, particle.colorB, 0.22],
			glowIntensity: 1.55,
		}
	}
	return {
		color: [particle.colorR, particle.colorG, particle.colorB, 0.015],
		glowColor: [particle.colorR, particle.colorG, particle.colorB, 0.002],
		glowIntensity: 0.08,
	}
}
