import {describe, expect, test} from "bun:test"
import {Object3D} from "@metafor/engine"
import {
	createAtomMarkerShellFrame,
	MAX_MARKER_SHELL_RADIUS_TO_TORUS_DIAMETER,
	resolvePerAtomMarkerShells,
	resolveMarkerShellRadius,
	resolveShellMarkerPositions,
} from "./shell-marker-placement.ts"

const MAX_LOCAL_RELATION_ENDPOINT_RADIUS_TO_TORUS_DIAMETER = 0.64
const WORLD_RATIO_TOLERANCE = 1e-5

describe("derived marker shell placement", () => {
	test("grows shell radius monotonically with marker count within its Atom envelope", () => {
		const sparse = resolveMarkerShellRadius(3, 120, 8)
		const populated = resolveMarkerShellRadius(12, 120, 8)
		const crowded = resolveMarkerShellRadius(48, 120, 8)
		const largerMarkers = resolveMarkerShellRadius(48, 120, 12)

		expect(populated).toBeGreaterThan(sparse)
		expect(crowded).toBeGreaterThanOrEqual(populated)
		expect(largerMarkers).toBeGreaterThanOrEqual(crowded)
		expect(sparse).toBeGreaterThan(120)
		expect(crowded / (120 * 2)).toBeLessThanOrEqual(
			MAX_MARKER_SHELL_RADIUS_TO_TORUS_DIAMETER,
		)
		expect(largerMarkers / (120 * 2)).toBeLessThanOrEqual(
			MAX_MARKER_SHELL_RADIUS_TO_TORUS_DIAMETER,
		)
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

	test("bounds a busy nested Atom shell and local relation endpoints against its own world torus", () => {
		const scene = new Object3D()
		const lada = new Object3D()
		lada.position.set(14, -8, 3)
		lada.scale.set(0.82, 0.82, 0.82)
		scene.add(lada)
		const chat = new Object3D()
		chat.position.set(31, 12, -4)
		chat.scale.set(0.13, 0.13, 0.13)
		lada.add(chat)
		const chatSend = new Object3D()
		chatSend.position.set(-27, 16, 5)
		chatSend.scale.set(0.1, 0.1, 0.1)
		chat.add(chatSend)

		const torus = new Object3D()
		const shell = createAtomMarkerShellFrame(12)
		chatSend.add(torus)
		chatSend.add(shell)
		const markers = Array.from({length: 96}, (_, index) => ({
			identity: index % 2 === 0 ? `field:${index}` : `state:${index}`,
			radius: 5,
		}))
		const positions = resolveShellMarkerPositions(markers, 50)
		const field = new Object3D()
		const state = new Object3D()
		const fieldPosition = positions.get("field:0")!
		const statePosition = positions.get("state:1")!
		field.position.set(fieldPosition.x, fieldPosition.y, fieldPosition.z)
		state.position.set(statePosition.x, statePosition.y, statePosition.z)
		shell.add(field)
		shell.add(state)

		// This is the exact derived render offset used by a Field-proxy endpoint.
		const proxy = new Object3D()
		const stateRadius = Math.hypot(statePosition.x, statePosition.y, statePosition.z)
		const proxyOffset = {
			x: statePosition.x / stateRadius * 5 * 0.93,
			y: statePosition.y / stateRadius * 5 * 0.93,
			z: statePosition.z / stateRadius * 5 * 0.93,
		}
		proxy.position.set(
			statePosition.x + proxyOffset.x,
			statePosition.y + proxyOffset.y,
			statePosition.z + proxyOffset.z,
		)
		shell.add(proxy)
		scene.updateWorldMatrix(true)

		const worldPoint = (object: Object3D): readonly [number, number, number] => [
			object.matrixWorld.elements[12]!,
			object.matrixWorld.elements[13]!,
			object.matrixWorld.elements[14]!,
		]
		const distance = (
			left: readonly [number, number, number],
			right: readonly [number, number, number],
		): number => Math.hypot(
			left[0] - right[0],
			left[1] - right[1],
			left[2] - right[2],
		)
		const torusCenter = worldPoint(torus)
		const cumulativeScale = 0.82 * 0.13 * 0.1
		const worldTorusDiameter = 50 * 2 * cumulativeScale
		const legacyUnboundedRadius = 50 + 5 * (0.45 + 0.82 * Math.sqrt(markers.length))

		expect(legacyUnboundedRadius / 100).toBeGreaterThan(0.9)
		const fieldRatio = distance(worldPoint(field), torusCenter) / worldTorusDiameter
		const stateRatio = distance(worldPoint(state), torusCenter) / worldTorusDiameter
		const worstCaseProxyRatio = distance(worldPoint(proxy), torusCenter) / worldTorusDiameter
		expect(fieldRatio).toBeCloseTo(MAX_MARKER_SHELL_RADIUS_TO_TORUS_DIAMETER, 5)
		expect(stateRatio).toBeCloseTo(MAX_MARKER_SHELL_RADIUS_TO_TORUS_DIAMETER, 5)
		expect(fieldRatio)
			.toBeLessThanOrEqual(MAX_MARKER_SHELL_RADIUS_TO_TORUS_DIAMETER + WORLD_RATIO_TOLERANCE)
		expect(stateRatio)
			.toBeLessThanOrEqual(MAX_MARKER_SHELL_RADIUS_TO_TORUS_DIAMETER + WORLD_RATIO_TOLERANCE)
		expect(worstCaseProxyRatio).toBeCloseTo(0.6365, 4)
		expect(worstCaseProxyRatio)
			.toBeLessThanOrEqual(MAX_LOCAL_RELATION_ENDPOINT_RADIUS_TO_TORUS_DIAMETER + WORLD_RATIO_TOLERANCE)
	})
})
