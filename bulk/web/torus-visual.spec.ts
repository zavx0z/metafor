import {describe, expect, test} from "bun:test"
import type {BulkDarkParticle} from "@metafor/types/bulk/manifest"
import {DEFAULT_BULK_SETTINGS} from "../settings.ts"
import {
	resolveDarkParticleTorusLayer,
	resolveDarkParticleTorusOpacity,
} from "./torus-visual.ts"

type TorusVisualInput = Pick<
	BulkDarkParticle,
	"activity" | "darkParticleKind" | "parentDarkParticleId"
>

const input = (
	overrides: Partial<TorusVisualInput> = {},
): TorusVisualInput => ({
	activity: "neutral",
	darkParticleKind: "atom",
	parentDarkParticleId: 1,
	...overrides,
})

describe("Capsule torus visual contrast", () => {
	test("uses the same opacity law for root and nested Atom toruses", () => {
		const opacity = DEFAULT_BULK_SETTINGS.render.wireframeOpacity

		expect(resolveDarkParticleTorusOpacity(
			input({parentDarkParticleId: null}),
			opacity,
		)).toBeCloseTo(0.22, 6)
		expect(resolveDarkParticleTorusOpacity(input(), opacity)).toBeCloseTo(0.22, 6)
		expect(resolveDarkParticleTorusOpacity(
			input({activity: "inactive"}),
			opacity,
		)).toBeCloseTo(0.1276, 6)
	})

	test("does not brighten non-Atom connectivity toruses and clamps the final alpha", () => {
		expect(resolveDarkParticleTorusOpacity(
			input({darkParticleKind: "fuzzy"}),
			DEFAULT_BULK_SETTINGS.render.wireframeOpacity,
		)).toBeCloseTo(0.0256, 6)
		expect(resolveDarkParticleTorusOpacity(
			input({activity: "active", parentDarkParticleId: null}),
			1,
		)).toBe(1)
	})

	test("uses the same scene-depth layer at every Atom depth", () => {
		expect(resolveDarkParticleTorusLayer(input())).toEqual({
			luminanceBoost: 1,
			silhouetteAmount: 0,
			visibilityMode: "scene",
		})
		expect(resolveDarkParticleTorusLayer(
			input({parentDarkParticleId: null}),
		)).toEqual({
			luminanceBoost: 1,
			silhouetteAmount: 0,
			visibilityMode: "scene",
		})
		expect(resolveDarkParticleTorusLayer(
			input({darkParticleKind: "fuzzy"}),
		)).toEqual({
			luminanceBoost: 1,
			silhouetteAmount: 0,
			visibilityMode: "scene",
		})
	})
})
