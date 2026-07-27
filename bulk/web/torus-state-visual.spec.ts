import {describe, expect, test} from "bun:test"
import {resolveTorusStateVisual} from "./torus-state-visual.ts"

const marker = (overrides: Partial<{
	active: boolean
	current: boolean
}> = {}) => ({
	active: false,
	current: false,
	colorR: 0.2,
	colorG: 0.68,
	colorB: 1,
	...overrides,
})

describe("Capsule torus State marker readability", () => {
	test("makes the current marker strongest and potential markers clearly secondary", () => {
		const current = resolveTorusStateVisual(marker({active: true, current: true}))
		const potential = resolveTorusStateVisual(marker({active: true}))
		const inactive = resolveTorusStateVisual(marker())

		expect(current.color[3]).toBe(0.96)
		expect(potential.color[3]).toBe(0.58)
		expect(inactive.color[3]).toBe(0.015)
		expect(current.color[3]).toBeGreaterThan(potential.color[3])
		expect(potential.color[3]).toBeGreaterThan(inactive.color[3])
		expect(current.glowIntensity).toBeGreaterThan(potential.glowIntensity)
		expect(potential.glowIntensity).toBeGreaterThan(inactive.glowIntensity)
	})

	test("changes only marker material strength and preserves its projected color", () => {
		const visual = resolveTorusStateVisual({
			active: true,
			current: false,
			colorR: 0.41,
			colorG: 0.72,
			colorB: 0.93,
		})

		expect(visual.color.slice(0, 3)).toEqual([0.41, 0.72, 0.93])
		expect(visual.glowColor.slice(0, 3)).toEqual([0.41, 0.72, 0.93])
		expect(visual.glowColor[3]).toBeLessThan(visual.color[3])
		expect(Object.keys(visual).toSorted()).toEqual([
			"color",
			"glowColor",
			"glowIntensity",
		])
	})
})
