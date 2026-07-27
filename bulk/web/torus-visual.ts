import type {BulkDarkParticle} from "@metafor/types/bulk/manifest"

type DarkParticleTorusVisualInput = Pick<
	BulkDarkParticle,
	"activity" | "darkParticleKind" | "parentDarkParticleId"
>

const ROOT_TORUS_OPACITY_MULTIPLIER = 2.75
const ATOM_TORUS_OPACITY_MULTIPLIER = 4.5
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
	const baseMultiplier = particle.parentDarkParticleId === null
		? ROOT_TORUS_OPACITY_MULTIPLIER
		: particle.darkParticleKind === "atom"
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

/**
 * Nested Atom toruses are the existing visual core. They stay one object with
 * unchanged geometry, but render after the enclosing root wireframe.
 */
export const resolveDarkParticleTorusLayer = (
	particle: DarkParticleTorusVisualInput,
): DarkParticleTorusLayer =>
	particle.parentDarkParticleId === null && particle.darkParticleKind === "atom"
		? {
			luminanceBoost: 1,
			silhouetteAmount: 1,
			visibilityMode: "silhouette",
		}
		: particle.parentDarkParticleId !== null && particle.darkParticleKind === "atom"
		? {
			luminanceBoost: particle.activity === "inactive" ? 1.15 : 1.35,
			silhouetteAmount: 0,
			visibilityMode: "overlay",
		}
		: {
			luminanceBoost: 1,
			silhouetteAmount: 0,
			visibilityMode: "scene",
		}
