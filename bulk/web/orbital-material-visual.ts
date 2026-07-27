import type {BulkOrbitalParticle} from "@metafor/types/bulk/manifest"
import {Color} from "@metafor/engine"
import {resolveTorusStateVisual} from "./torus-state-visual.ts"

export type OrbitalMaterialVisual = Readonly<{
	color: Color
	glowColor: Color
	glowIntensity: number
	luminanceBoost: number
	shimmerAmount: number
	shimmerPhase: number
	visibilityMode: "scene" | "overlay"
}>

/**
 * Converts a projected orbital particle into the complete renderer material
 * state. State-marker GPU controls must cross this boundary together.
 */
export const resolveOrbitalMaterialVisual = (
	particle: BulkOrbitalParticle,
): OrbitalMaterialVisual => {
	if (particle.orbitalParticleKind === "state") {
		const visual = resolveTorusStateVisual(particle)
		return {
			color: new Color(...visual.color),
			glowColor: new Color(...visual.glowColor),
			glowIntensity: visual.glowIntensity,
			luminanceBoost: visual.luminanceBoost,
			shimmerAmount: visual.shimmerAmount,
			shimmerPhase: visual.shimmerPhase,
			visibilityMode: visual.visibilityMode,
		}
	}

	const alpha = particle.current ? 0.82 : particle.active ? 0.5 : 0.16
	const glowAlpha = particle.current ? 0.34 : particle.active ? 0.16 : 0.035
	return {
		color: new Color(particle.colorR, particle.colorG, particle.colorB, alpha),
		glowColor: new Color(
			particle.colorR,
			particle.colorG,
			particle.colorB,
			glowAlpha,
		),
		glowIntensity: particle.current ? 1.9 : particle.active ? 1.15 : 0.42,
		luminanceBoost: 1,
		shimmerAmount: 0,
		shimmerPhase: 0,
		visibilityMode: "scene",
	}
}
