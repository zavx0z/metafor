import {describe, expect, test} from "bun:test"
import {resolveAtomMarkerPosition} from "./atom-marker-placement.ts"

describe("Atom-local marker placement", () => {
	test("keeps Fields in the nucleus and States in the toroidal composition", () => {
		const markers = [
			{kind: "field", localX: 0, localY: 0, localZ: 0},
			{kind: "field", localX: 8, localY: 0, localZ: 0},
			{kind: "state", localX: 31, localY: 0, localZ: 4},
			{kind: "state", localX: 0, localY: -27, localZ: -4},
		] as const
		const positions = markers.map(resolveAtomMarkerPosition)

		expect(positions).toEqual([
			{x: 0, y: 0, z: 0},
			{x: 8, y: 0, z: 0},
			{x: 31, y: 0, z: 4},
			{x: 0, y: -27, z: -4},
		])
		expect(Math.hypot(positions[0]!.x, positions[0]!.y, positions[0]!.z)).toBe(0)
		expect(Math.hypot(positions[1]!.x, positions[1]!.y, positions[1]!.z)).toBe(8)
		expect(Math.hypot(positions[2]!.x, positions[2]!.y, positions[2]!.z))
			.not.toBe(Math.hypot(positions[3]!.x, positions[3]!.y, positions[3]!.z))
	})

	test("does not derive placement from marker count, radius or identity", () => {
		const position = resolveAtomMarkerPosition({
			localX: -12,
			localY: 7,
			localZ: 3,
		})

		expect(position).toEqual({x: -12, y: 7, z: 3})
		expect(Math.hypot(position.x, position.y, position.z)).toBeLessThan(50)
	})
})
