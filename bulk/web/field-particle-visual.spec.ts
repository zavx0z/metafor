import {describe, expect, test} from "bun:test"
import {resolveFieldParticleVisual} from "./field-particle-visual.ts"

const field = {
	colorR: 0.2,
	colorG: 0.68,
	colorB: 1,
}

describe("self-similar Atom nucleus Fields", () => {
	test("uses an opaque depth-tested marker without washing out the semantic Field color", () => {
		const visual = resolveFieldParticleVisual(field)

		expect(visual.color).toEqual([0.2, 0.68, 1, 1])
		expect(visual.glowColor).toEqual([0.2, 0.68, 1, 0.1])
		expect(visual.glowIntensity).toBe(0.8)
		expect(visual.opacity).toBe(1)
		expect(visual.luminanceBoost).toBe(1)
		expect(visual.visualScale).toBe(1)
		expect(visual.visibilityMode).toBe("scene")
	})

	test("does not change color, scale or depth mode in a nested Atom", () => {
		expect(resolveFieldParticleVisual(field)).toMatchObject({
			color: [0.2, 0.68, 1, 1],
			visualScale: 1,
			visibilityMode: "scene",
		})
	})
})
