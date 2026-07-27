import {describe, expect, test} from "bun:test"
import type {BulkDarkParticle} from "@metafor/types/bulk/manifest"
import {DEFAULT_BULK_SETTINGS} from "../settings.ts"
import {resolveDarkParticleTorusOpacity} from "./torus-visual.ts"

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
	test("keeps root and nested Atom toruses visibly opaque at the default render setting", () => {
		const opacity = DEFAULT_BULK_SETTINGS.render.wireframeOpacity

		expect(resolveDarkParticleTorusOpacity(
			input({parentDarkParticleId: null}),
			opacity,
		)).toBeCloseTo(0.22, 6)
		expect(resolveDarkParticleTorusOpacity(input(), opacity)).toBeCloseTo(0.14, 6)
		expect(resolveDarkParticleTorusOpacity(
			input({activity: "inactive"}),
			opacity,
		)).toBeCloseTo(0.0812, 6)
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
})
