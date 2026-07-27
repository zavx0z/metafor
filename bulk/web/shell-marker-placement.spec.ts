import {describe, expect, test} from "bun:test"
import {Object3D} from "@metafor/engine"
import {
	createAtomMarkerShellFrame,
	resolvePerAtomMarkerShells,
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

	test("keeps nested Atom markers in separate origin-centered local shells", () => {
		const shells = resolvePerAtomMarkerShells(
			[
				{atomId: 1, torusOuterRadius: 180},
				{atomId: 7, torusOuterRadius: 70},
			],
			[
				{atomId: 1, identity: "field:root-a", radius: 8},
				{atomId: 1, identity: "state:root-b", radius: 8},
				{atomId: 7, identity: "field:chat-send-a", radius: 5},
				{atomId: 7, identity: "state:chat-send-b", radius: 5},
				{atomId: 7, identity: "state:chat-send-c", radius: 5},
			],
		)
		const root = shells.get(1)!
		const chatSend = shells.get(7)!

		expect(shells.size).toBe(2)
		expect(root.center).toEqual({x: 0, y: 0, z: 0})
		expect(chatSend.center).toEqual({x: 0, y: 0, z: 0})
		expect([...root.positions.keys()].sort()).toEqual([
			"field:root-a",
			"state:root-b",
		])
		expect([...chatSend.positions.keys()].sort()).toEqual([
			"field:chat-send-a",
			"state:chat-send-b",
			"state:chat-send-c",
		])
		expect(root.positions.has("field:chat-send-a")).toBe(false)
		expect(chatSend.positions.has("field:root-a")).toBe(false)
		for (const position of root.positions.values()) {
			expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(
				root.radius,
				8,
			)
		}
		for (const position of chatSend.positions.values()) {
			expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(
				chatSend.radius,
				8,
			)
		}
		expect(chatSend.radius).toBeGreaterThan(70)
	})

	test("inherits exactly the owning nested Atom transform", () => {
		const space = new Object3D()
		const rootAtom = new Object3D()
		rootAtom.position.set(30, -20, 10)
		rootAtom.scale.set(0.8, 0.8, 0.8)
		space.add(rootAtom)
		const chatSendAtom = new Object3D()
		chatSendAtom.position.set(90, 45, -12)
		chatSendAtom.scale.set(0.5, 0.5, 0.5)
		rootAtom.add(chatSendAtom)
		const torus = new Object3D()
		const shell = createAtomMarkerShellFrame(7)
		const marker = new Object3D()
		marker.position.set(0, 80, 0)
		marker.updateMatrix()
		chatSendAtom.add(torus)
		chatSendAtom.add(shell)
		shell.add(marker)
		space.updateWorldMatrix(true)

		const torusCenter = torus.matrixWorld.elements.slice(12, 15)
		const shellCenter = shell.matrixWorld.elements.slice(12, 15)
		const markerCenter = marker.matrixWorld.elements.slice(12, 15)
		expect(shell.parent).toBe(chatSendAtom)
		expect(shellCenter).toEqual(torusCenter)
		expect(Math.hypot(
			markerCenter[0]! - shellCenter[0]!,
			markerCenter[1]! - shellCenter[1]!,
			markerCenter[2]! - shellCenter[2]!,
		)).toBeCloseTo(80 * 0.8 * 0.5, 8)
	})
})
