import {describe, expect, test} from "bun:test"
import {resolveFieldParticleVisual} from "./field-particle-visual.ts"

const field = {
	colorR: 0.2,
	colorG: 0.68,
	colorB: 1,
}

describe("self-similar Atom nucleus Fields", () => {
	test("preserves semantic Field color and ordinary scene depth", () => {
		const visual = resolveFieldParticleVisual(field, 0.08)

		expect(visual.color).toEqual([0.2, 0.68, 1, 1])
		expect(visual.opacity).toBeCloseTo(0.072, 6)
		expect(visual.luminanceBoost).toBe(1)
		expect(visual.visualScale).toBe(1)
		expect(visual.visibilityMode).toBe("scene")
	})

	test("does not change color, scale or depth mode in a nested Atom", () => {
		expect(resolveFieldParticleVisual(field, 0.08)).toMatchObject({
			color: [0.2, 0.68, 1, 1],
			visualScale: 1,
			visibilityMode: "scene",
		})
	})
})
