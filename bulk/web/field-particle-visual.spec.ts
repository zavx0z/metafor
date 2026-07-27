import {describe, expect, test} from "bun:test"
import {resolveFieldParticleVisual} from "./field-particle-visual.ts"

const field = {
	colorR: 0.2,
	colorG: 0.68,
	colorB: 1,
}

describe("nested Atom nucleus Field accents", () => {
	test("preserves root-nucleus Field color and ordinary scene depth", () => {
		const visual = resolveFieldParticleVisual(field, 1, 0.08)

		expect(visual.color).toEqual([0.2, 0.68, 1, 1])
		expect(visual.opacity).toBeCloseTo(0.072, 6)
		expect(visual.luminanceBoost).toBe(1)
		expect(visual.visualScale).toBe(1)
		expect(visual.visibilityMode).toBe("scene")
	})

	test("makes existing nested Field spheres bounded red overlay accents", () => {
		const visual = resolveFieldParticleVisual(field, 2, 0.08)

		expect(visual.color).toEqual([1, 0.12, 0.08, 0.68])
		expect(visual.glowColor).toEqual([1, 0.34, 0.16, 0.5])
		expect(visual.color[0]).toBeGreaterThan(visual.color[1] * 8)
		expect(visual.glowIntensity).toBe(2.2)
		expect(visual.luminanceBoost).toBe(1.25)
		expect(visual.opacity).toBeLessThan(1)
		expect(visual.visualScale).toBe(0.38)
		expect(visual.visualScale).toBeLessThan(1)
		expect(visual.visibilityMode).toBe("overlay")
	})
})
