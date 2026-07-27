import {describe, expect, test} from "bun:test"
import {shouldContinueBulkRenderLoop} from "./render-loop.ts"
import {
	resolveSemanticStateColor,
	resolveTorusStateVisual,
} from "./torus-state-visual.ts"

const marker = (overrides: Partial<{
	active: boolean
	current: boolean
}> = {}) => ({
	active: false,
	current: false,
	colorR: 0.2,
	colorG: 0.68,
	colorB: 1,
	orbitalParticleId: "state:fixture",
	sourceId: 17,
	...overrides,
})

const rgbHue = (color: readonly number[]): number => {
	const red = color[0]!
	const green = color[1]!
	const blue = color[2]!
	const maximum = Math.max(red, green, blue)
	const minimum = Math.min(red, green, blue)
	const delta = maximum - minimum
	if (delta === 0) return 0
	const sector = maximum === red
		? ((green - blue) / delta) % 6
		: maximum === green
			? (blue - red) / delta + 2
			: (red - green) / delta + 4
	return ((sector * 60) + 360) % 360
}

describe("Capsule torus State marker readability", () => {
	test("makes the current marker strongest and potential markers clearly secondary", () => {
		const current = resolveTorusStateVisual(marker({active: true, current: true}))
		const potential = resolveTorusStateVisual(marker({active: true}))
		const inactive = resolveTorusStateVisual(marker())

		expect(current.color[3]).toBe(1)
		expect(potential.color[3]).toBe(0.5)
		expect(inactive.color[3]).toBe(0.14)
		expect(current.color[3]).toBeGreaterThan(potential.color[3])
		expect(potential.color[3]).toBeGreaterThan(inactive.color[3])
		expect(current.glowIntensity).toBeGreaterThan(potential.glowIntensity)
		expect(potential.glowIntensity).toBeGreaterThan(inactive.glowIntensity)
		expect(current.luminanceBoost).toBeGreaterThan(potential.luminanceBoost)
		expect(current.glowIntensity).toBe(4.8)
		expect(current.luminanceBoost).toBe(1.45)
		expect(potential.luminanceBoost).toBeGreaterThanOrEqual(1.1)
		expect(current.glowIntensity / potential.glowIntensity).toBeGreaterThanOrEqual(2)
	})

	test("keeps semantic hue in the aura while giving the current core a white peak", () => {
		const visual = resolveTorusStateVisual({
			active: true,
			current: true,
			orbitalParticleId: "state:colored",
			sourceId: 23,
		})
		const semanticColor = resolveSemanticStateColor(23)

		expect(visual.color[0]).toBeGreaterThan(semanticColor[0])
		expect(visual.color[1]).toBeGreaterThan(semanticColor[1])
		expect(visual.color[2]).toBeGreaterThan(semanticColor[2])
		expect(visual.glowColor[0]).toBeGreaterThan(visual.color[0])
		expect(visual.glowColor[1]).toBeGreaterThan(visual.color[1])
		expect(visual.glowColor[2]).toBeGreaterThan(visual.color[2])
		expect(visual.glowColor[3]).toBeLessThan(visual.color[3])
		expect(Object.keys(visual).toSorted()).toEqual([
			"color",
			"glowColor",
			"glowIntensity",
			"luminanceBoost",
			"shimmerAmount",
			"shimmerPhase",
			"visibilityMode",
		])
	})

	test("uses a bounded state-change phase without claiming perpetual render activity", () => {
		const current = resolveTorusStateVisual(marker({active: true, current: true}))
		const potential = resolveTorusStateVisual(marker({active: true, current: false}))
		const repeatedPotential = resolveTorusStateVisual(marker({active: true, current: false}))

		expect(current.shimmerPhase).toBeGreaterThanOrEqual(0)
		expect(current.shimmerPhase).toBeLessThan(Math.PI * 2)
		expect(potential.shimmerPhase).not.toBe(current.shimmerPhase)
		expect(repeatedPotential.shimmerPhase).toBe(potential.shimmerPhase)
		expect(current.shimmerAmount).toBeLessThanOrEqual(0.13)
		expect(potential.shimmerAmount).toBeLessThan(current.shimmerAmount)
		expect(current.visibilityMode).toBe("scene")
		expect(potential.visibilityMode).toBe("overlay")
		expect(resolveTorusStateVisual(marker()).visibilityMode).toBe("overlay")
		expect(Object.values(current).filter(Array.isArray)).toHaveLength(2)

		expect(shouldContinueBulkRenderLoop({
			cosmosMotion: false,
			navigationActive: false,
			pendingMotion: false,
			timestamp: 10_000,
			wakeUntilMs: 10_000,
		})).toBe(false)
	})

	test("keys hue by semantic State identity rather than occurrence or activity", () => {
		const firstOccurrence = resolveTorusStateVisual({
			...marker({active: true}),
			orbitalParticleId: "state:17:first",
		})
		const secondOccurrence = resolveTorusStateVisual({
			...marker({active: true}),
			orbitalParticleId: "state:17:second",
		})
		const differentState = resolveTorusStateVisual({
			...marker({active: true}),
			orbitalParticleId: "state:18:first",
			sourceId: 18,
		})
		const current = resolveTorusStateVisual(marker({active: true, current: true}))
		const inactive = resolveTorusStateVisual(marker())

		expect(firstOccurrence.color).toEqual(secondOccurrence.color)
		expect(firstOccurrence.glowColor).toEqual(secondOccurrence.glowColor)
		expect(resolveSemanticStateColor(17)).not.toEqual(
			resolveSemanticStateColor(18),
		)
		expect(firstOccurrence.color).not.toEqual(differentState.color)
		expect(rgbHue(current.color)).toBeCloseTo(rgbHue(firstOccurrence.color), 8)
		expect(rgbHue(inactive.color)).toBeCloseTo(
			rgbHue(firstOccurrence.color),
			8,
		)
		expect(new Set(
			Array.from({length: 16}, (_, index) =>
				resolveSemanticStateColor(index + 1).join(":")),
		).size).toBe(16)
	})
})
