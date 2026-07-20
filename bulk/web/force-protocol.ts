export {
	resolveForceFieldId,
	resolveForceFieldsPayload,
} from "shared/protocol/force/fields"

import type {Particle} from "shared/protocol/force/particle"

export type ForceImpulseVisual = {
	color: [number, number, number, number]
	delayMs: number
	durationMs: number
	startOffset: [number, number, number]
	targetOffset: [number, number, number]
}

export type ForceImpulseTiming = {
	elapsedMs: number
	remainingMs: number
}

const IMPULSE_MIN_RADIUS_MM = 2
const IMPULSE_MAX_RADIUS_MM = 20
const IMPULSE_TARGET_SCALE_RATIO = 0.12

const colors: Record<Particle["part"], [number, number, number, number]> = {
	inflaton: [0.98, 0.28, 0.92, 0.94],
	graviton: [0.36, 0.74, 1, 0.94],
	photon: [1, 0.94, 0.28, 0.94],
	gluon: [0.2, 1, 0.58, 0.94],
	higgs: [1, 0.52, 0.18, 0.94],
	z: [0.68, 0.42, 1, 0.94],
	"w+": [0.24, 0.92, 1, 0.94],
	"w-": [1, 0.22, 0.28, 0.94],
}

/** Deterministic transient manifestation derived only from the ordinary Patch. */
export const resolveForceImpulseVisual = (part: Particle): ForceImpulseVisual => {
	if (part.part === "inflaton" && part.by === "agent") {
		return {color: colors.inflaton, delayMs: 0, durationMs: 720, startOffset: [-9, -4, 7], targetOffset: [-4, -1, 2]}
	}
	if (part.part === "inflaton" && part.by === "dark") {
		return {color: colors.inflaton, delayMs: 120, durationMs: 720, startOffset: [-4, -1, 2], targetOffset: [0, 0, 0]}
	}
	if (part.part === "graviton" && part.by === "boundary") {
		return {color: colors.graviton, delayMs: 160, durationMs: 760, startOffset: [5, 2, 5], targetOffset: [0, 0, 0]}
	}
	return {color: colors[part.part], delayMs: 0, durationMs: 900, startOffset: [5, -3, 8], targetOffset: [0, 0, 0]}
}

/** Keeps a transient readable at the scale of the object it manifests around. */
export const resolveForceImpulseRadius = (targetScaleMm: number): number => {
	const scale = Number.isFinite(targetScaleMm) && targetScaleMm > 0
		? targetScaleMm
		: IMPULSE_MIN_RADIUS_MM / IMPULSE_TARGET_SCALE_RATIO
	return Math.max(
		IMPULSE_MIN_RADIUS_MM,
		Math.min(IMPULSE_MAX_RADIUS_MM, scale * IMPULSE_TARGET_SCALE_RATIO),
	)
}

/** Resolves the current phase without turning an already completed Particle into replay. */
export const resolveForceImpulseTiming = (part: Particle, nowMs: number): ForceImpulseTiming | null => {
	const law = resolveForceImpulseVisual(part)
	const ageMs = Math.max(0, nowMs - part.ts)
	const totalMs = law.delayMs + law.durationMs
	if (ageMs >= totalMs) return null
	return {
		elapsedMs: ageMs - law.delayMs,
		remainingMs: totalMs - ageMs,
	}
}

/** A newly materialized root is the deterministic next scene for the Viewpoint. */
export const materializedRootSrc = (part: Particle): string | null => {
	if (part.part !== "graviton" || part.op !== "add" || typeof part.path !== "string" || !/^atom\/\d+$/.test(part.path)) return null
	if (typeof part.value !== "object" || part.value === null || Array.isArray(part.value)) return null
	const value = part.value as Record<string, unknown>
	const atom = typeof value.atom === "object" && value.atom !== null && !Array.isArray(value.atom)
		? value.atom as Record<string, unknown>
		: value
	return atom.parentAtom === null && atom.parentTopology === null && typeof atom.wimp === "string" && atom.wimp.length > 0
		? atom.wimp
		: null
}

export const observedRootSrc = (part: Particle, existingRootSrcs: ReadonlySet<string>): string | null => {
	const materialized = materializedRootSrc(part)
	if (materialized !== null) return materialized
	if (part.part !== "graviton" || part.op !== "add" || part.path !== "wimp") return null
	if (typeof part.value !== "object" || part.value === null || Array.isArray(part.value)) return null
	const src = (part.value as Record<string, unknown>).src
	return typeof src === "string" && existingRootSrcs.has(src) ? src : null
}
