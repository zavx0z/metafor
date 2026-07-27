import {describe, expect, test} from "bun:test"
import type {BulkOrbitalParticle} from "@metafor/types/bulk/manifest"
import {LineGlowMaterial} from "@metafor/engine"
import {resolveOrbitalMaterialVisual} from "./orbital-material-visual.ts"
import {resolveTorusStateVisual} from "./torus-state-visual.ts"

const particle = (
	overrides: Partial<BulkOrbitalParticle> = {},
): BulkOrbitalParticle => ({
	orbitalParticleId: "state:fixture",
	sourceId: 1,
	parentDarkParticleId: 1,
	orbitalParticleKind: "state",
	label: "Fixture",
	active: true,
	current: true,
	sleeveRootStateId: 1,
	relatedStateIds: [],
	colorR: 0.2,
	colorG: 0.68,
	colorB: 1,
	localX: 0,
	localY: 0,
	localZ: 0,
	sphereRadius: 1,
	...overrides,
})

describe("Bulk orbital material visual boundary", () => {
	test("forwards every current State GPU readability control into LineGlowMaterial", () => {
		const input = particle()
		const stateVisual = resolveTorusStateVisual(input)
		const materialVisual = resolveOrbitalMaterialVisual(input)
		const material = new LineGlowMaterial({...materialVisual, opacity: 1})

		expect(material.luminanceBoost).toBe(stateVisual.luminanceBoost)
		expect(material.shimmerAmount).toBe(stateVisual.shimmerAmount)
		expect(material.shimmerPhase).toBe(stateVisual.shimmerPhase)
		expect(material.glowIntensity).toBe(stateVisual.glowIntensity)
		expect(material.luminanceBoost).toBeGreaterThan(1)
		expect(material.shimmerAmount).toBeGreaterThan(0)
	})

	test("keeps potential State markers luminous but secondary", () => {
		const current = resolveOrbitalMaterialVisual(particle())
		const potential = resolveOrbitalMaterialVisual(
			particle({current: false}),
		)

		expect(potential.luminanceBoost).toBeGreaterThan(1)
		expect(potential.shimmerAmount).toBeGreaterThan(0)
		expect(current.luminanceBoost).toBeGreaterThan(
			potential.luminanceBoost,
		)
		expect(current.glowIntensity).toBeGreaterThanOrEqual(
			potential.glowIntensity * 2,
		)
	})

	test("leaves non-State orbital materials on neutral GPU effect controls", () => {
		const visual = resolveOrbitalMaterialVisual(
			particle({orbitalParticleKind: "axion"}),
		)

		expect(visual.luminanceBoost).toBe(1)
		expect(visual.shimmerAmount).toBe(0)
		expect(visual.shimmerPhase).toBe(0)
	})
})
