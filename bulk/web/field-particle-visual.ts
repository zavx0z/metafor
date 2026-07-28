import type {BulkFieldParticle} from "@metafor/types/bulk/manifest"
import {resolvePotentialMarkerReadability} from "./torus-state-visual.ts"

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

/** Applies the potential-State marker class with the semantic Field type color. */
export const resolveFieldParticleVisual = (
	particle: FieldParticleVisualInput,
): FieldParticleVisual => {
	const marker = resolvePotentialMarkerReadability([
		particle.colorR,
		particle.colorG,
		particle.colorB,
	])
	return {
		...marker,
		opacity: 1,
		visualScale: 1,
	}
}
