import type {BulkDarkParticle} from "@metafor/types/bulk/manifest"

type DarkParticleTorusVisualInput = Pick<
	BulkDarkParticle,
	"activity" | "darkParticleKind" | "parentDarkParticleId"
>

const ATOM_TORUS_OPACITY_MULTIPLIER = 2.75
const CONNECTIVITY_TORUS_OPACITY_MULTIPLIER = 0.32
const ACTIVE_TORUS_OPACITY_MULTIPLIER = 1.08
const INACTIVE_TORUS_OPACITY_MULTIPLIER = 0.58

/**
 * Keeps Capsule Atom toruses legible against the deep-space background
 * without brightening Field particles, connectivity geometry or the HUD.
 */
export const resolveDarkParticleTorusOpacity = (
	particle: DarkParticleTorusVisualInput,
	wireframeOpacity: number,
): number => {
	const baseMultiplier = particle.darkParticleKind === "atom"
		? ATOM_TORUS_OPACITY_MULTIPLIER
		: CONNECTIVITY_TORUS_OPACITY_MULTIPLIER
	const activityMultiplier = particle.activity === "active"
		? ACTIVE_TORUS_OPACITY_MULTIPLIER
		: particle.activity === "inactive"
			? INACTIVE_TORUS_OPACITY_MULTIPLIER
			: 1
	return Math.min(1, Math.max(0, wireframeOpacity * baseMultiplier * activityMultiplier))
}

export type DarkParticleTorusLayer = Readonly<{
	luminanceBoost: number
	silhouetteAmount: number
	visibilityMode: "scene" | "overlay" | "silhouette"
}>

/** Keeps root and nested Atom toruses on the same scene-depth visual path. */
export const resolveDarkParticleTorusLayer = (
	_particle: DarkParticleTorusVisualInput,
): DarkParticleTorusLayer => ({
	luminanceBoost: 1,
	silhouetteAmount: 0,
	visibilityMode: "scene",
})
