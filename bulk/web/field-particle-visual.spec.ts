import {describe, expect, test} from "bun:test"
import {
	resolveFieldParticleVisual,
	resolveTorusStateVisual,
} from "@metafor/visual"

const field = {
	fieldParticleId: "field:fixture",
	colorR: 0.2,
	colorG: 0.68,
	colorB: 1,
}

describe("depth-independent Atom nucleus Fields", () => {
	test("uses the State bubble style without washing out the semantic Field color", () => {
		const visual = resolveFieldParticleVisual(field)
		const potentialState = resolveTorusStateVisual({
			active: true,
			current: false,
			orbitalParticleId: "state:fixture",
			sourceId: 17,
		})

		expect(visual.color).toEqual([0.2, 0.68, 1, 0.5])
		expect(visual.glowColor).toEqual([0.2, 0.68, 1, 0.4])
		expect(visual.glowIntensity).toBe(potentialState.glowIntensity)
		expect(visual.luminanceBoost).toBe(potentialState.luminanceBoost)
		expect(visual.shimmerAmount).toBe(potentialState.shimmerAmount)
		expect(visual.shimmerPhase).toBeGreaterThanOrEqual(0)
		expect(visual.shimmerPhase).toBeLessThan(Math.PI * 2)
		expect(visual.opacity).toBe(1)
		expect(visual.visualScale).toBe(1)
		expect(visual.visibilityMode).toBe("scene")
	})

	test("does not change color, scale or depth mode in a nested Atom", () => {
		expect(resolveFieldParticleVisual(field)).toMatchObject({
			color: [0.2, 0.68, 1, 0.5],
			visualScale: 1,
			visibilityMode: "scene",
		})
	})

	test("keeps shimmer stable per Field identity", () => {
		const first = resolveFieldParticleVisual(field)
		const repeated = resolveFieldParticleVisual(field)
		const different = resolveFieldParticleVisual({
			...field,
			fieldParticleId: "field:other",
		})

		expect(repeated.shimmerPhase).toBe(first.shimmerPhase)
		expect(different.shimmerPhase).not.toBe(first.shimmerPhase)
	})
})
