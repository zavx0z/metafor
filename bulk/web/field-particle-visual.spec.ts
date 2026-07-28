import {describe, expect, test} from "bun:test"
import {resolveFieldParticleVisual} from "./field-particle-visual.ts"
import {resolvePotentialMarkerReadability} from "./torus-state-visual.ts"

const field = {
	colorR: 0.2,
	colorG: 0.68,
	colorB: 1,
}

describe("self-similar Atom nucleus Fields", () => {
	test("uses the potential-State marker class with the semantic Field color", () => {
		const visual = resolveFieldParticleVisual(field)
		const marker = resolvePotentialMarkerReadability([field.colorR, field.colorG, field.colorB])

		expect(visual).toMatchObject(marker)
		expect(visual.color[0]).toBeCloseTo(0.424, 12)
		expect(visual.color[1]).toBeCloseTo(0.7696, 12)
		expect(visual.color.slice(2)).toEqual([1, 0.5])
		expect(visual.glowColor[0]).toBeCloseTo(0.584, 12)
		expect(visual.glowColor[1]).toBeCloseTo(0.8336, 12)
		expect(visual.glowColor.slice(2)).toEqual([1, 0.4])
		expect(visual.glowIntensity).toBe(2.4)
		expect(visual.opacity).toBe(1)
		expect(visual.luminanceBoost).toBe(1.1)
		expect(visual.visualScale).toBe(1)
		expect(visual.visibilityMode).toBe("overlay")
	})

	test("does not change color, scale or depth mode in a nested Atom", () => {
		const marker = resolvePotentialMarkerReadability([field.colorR, field.colorG, field.colorB])
		expect(resolveFieldParticleVisual(field)).toMatchObject({
			color: marker.color,
			visualScale: 1,
			visibilityMode: "overlay",
		})
	})
})
