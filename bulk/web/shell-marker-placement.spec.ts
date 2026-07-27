import {describe, expect, test} from "bun:test"
import {
	resolveMarkerShellRadius,
	resolveShellMarkerPositions,
} from "./shell-marker-placement.ts"

describe("derived marker shell placement", () => {
	test("grows shell radius monotonically with marker count", () => {
		const sparse = resolveMarkerShellRadius(3, 120, 8)
		const populated = resolveMarkerShellRadius(12, 120, 8)
		const crowded = resolveMarkerShellRadius(48, 120, 8)
		const largerMarkers = resolveMarkerShellRadius(48, 120, 12)

		expect(populated).toBeGreaterThan(sparse)
		expect(crowded).toBeGreaterThan(populated)
		expect(largerMarkers).toBeGreaterThan(crowded)
		expect(sparse).toBeGreaterThan(120)
	})

	test("distributes identities on a sphere enclosing the centered torus", () => {
		const markers = Array.from({length: 18}, (_, index) => ({
			identity: `state:${index + 1}`,
			radius: 6 + index % 3,
		}))
		const first = resolveShellMarkerPositions(markers, 140)
		const second = resolveShellMarkerPositions([...markers].reverse(), 140)
		const expectedRadius = resolveMarkerShellRadius(18, 140, 8)
		const directions = new Set<string>()
		const unitDirections: Array<readonly [number, number, number]> = []

		expect([...first.entries()]).toEqual([...second.entries()])
		expect(expectedRadius).toBeGreaterThan(140)
		for (const marker of markers) {
			const point = first.get(marker.identity)
			expect(point).toBeDefined()
			const radialDistance = Math.hypot(point!.x, point!.y, point!.z)
			expect(radialDistance).toBeCloseTo(expectedRadius, 8)
			directions.add([
				(point!.x / radialDistance).toFixed(5),
				(point!.y / radialDistance).toFixed(5),
				(point!.z / radialDistance).toFixed(5),
			].join(":"))
			unitDirections.push([
				point!.x / radialDistance,
				point!.y / radialDistance,
				point!.z / radialDistance,
			])
		}
		expect(directions.size).toBe(markers.length)
		let minimumSeparation = Number.POSITIVE_INFINITY
		for (let left = 0; left < unitDirections.length; left += 1) {
			for (let right = left + 1; right < unitDirections.length; right += 1) {
				const a = unitDirections[left]!
				const b = unitDirections[right]!
				minimumSeparation = Math.min(
					minimumSeparation,
					Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
				)
			}
		}
		expect(minimumSeparation).toBeGreaterThan(0.45)
	})
})
