import {describe, expect, test} from "bun:test"
import {
	BufferAttribute,
	BufferGeometry,
	LineGlowMaterial,
	LineSegments,
	Object3D,
	Vector3,
} from "@metafor/engine"
import {bulkLayoutConfig} from "../settings.ts"
import {resolveBulkViewportFitPose} from "../web-navigation.ts"
import {
	resolveOwnedAtomVisualFitBounds,
	type OwnedAtomFitGeometry,
	type OwnedAtomFitSphere,
} from "./atom-visual-fit.ts"
import {resolveShellMarkerPositions} from "./shell-marker-placement.ts"

const PORTRAIT_ASPECT = 818 / 1089
const FIT_EPSILON = 1e-6

const geometryFromPoints = (points: readonly Vector3[]): BufferGeometry =>
	new BufferGeometry().setAttribute(
		"position",
		new BufferAttribute(
			new Float32Array(points.flatMap((point) => [point.x, point.y, point.z])),
			3,
		),
	)

const boxGeometry = (radius: number): BufferGeometry => geometryFromPoints([
	new Vector3(-radius, -radius, -radius),
	new Vector3(radius, radius, radius),
])

const torusGeometry = (): BufferGeometry => {
	const majorRadius = 100 / 3
	const tubeRadius = 50 - majorRadius
	const points: Vector3[] = []
	for (let radial = 0; radial < 48; radial += 1) {
		const u = Math.PI * 2 * radial / 48
		for (let tubular = 0; tubular < 24; tubular += 1) {
			const v = Math.PI * 2 * tubular / 24
			const ringRadius = majorRadius + tubeRadius * Math.cos(v)
			points.push(new Vector3(
				ringRadius * Math.cos(u),
				ringRadius * Math.sin(u),
				tubeRadius * Math.sin(v),
			))
		}
	}
	return geometryFromPoints(points)
}

const worldCenter = (node: Object3D): Vector3 => new Vector3(
	node.matrixWorld.elements[12]!,
	node.matrixWorld.elements[13]!,
	node.matrixWorld.elements[14]!,
)

const maximumProjectedExtent = (
	position: Vector3,
	target: Vector3,
	points: readonly Vector3[],
): number => {
	const forward = target.clone().sub(position).normalize()
	const right = forward.clone().cross(new Vector3(0, 0, 1)).normalize()
	const screenUp = right.clone().cross(forward).normalize()
	const verticalTan = Math.tan(bulkLayoutConfig.viewport.camera.fovRad / 2)
	const horizontalTan = verticalTan * PORTRAIT_ASPECT
	return points.reduce((maximum, point) => {
		const offset = point.clone().sub(position)
		const depth = offset.dot(forward)
		if (depth <= 1e-6) return Number.POSITIVE_INFINITY
		return Math.max(
			maximum,
			Math.abs(offset.dot(right) / (depth * horizontalTan)),
			Math.abs(offset.dot(screenUp) / (depth * verticalTan)),
		)
	}, 0)
}

const addAtomVisualFixture = (
	atomId: number,
	container: Object3D,
	geometries: OwnedAtomFitGeometry[],
	spheres: OwnedAtomFitSphere[],
): LineSegments => {
	const torus = new LineSegments(torusGeometry(), new LineGlowMaterial())
	container.add(torus)
	geometries.push({atomId, geometry: torus.geometry, node: torus})

	const shell = new Object3D()
	container.add(shell)
	const markerSpecs = Array.from({length: 96}, (_, index) => ({
		identity: index % 2 === 0 ? `field:${atomId}:${index}` : `state:${atomId}:${index}`,
		radius: 5,
	}))
	const positions = resolveShellMarkerPositions(markerSpecs, 50)
	for (const marker of markerSpecs) {
		const position = positions.get(marker.identity)!
		const node = new Object3D()
		node.position.set(position.x, position.y, position.z)
		shell.add(node)
		spheres.push({atomId, node, radius: marker.radius})
	}

	const statePosition = positions.get(`state:${atomId}:1`)!
	const stateRadius = Math.hypot(statePosition.x, statePosition.y, statePosition.z)
	const proxyPosition = new Vector3(
		statePosition.x * (1 + 5 * 0.93 / stateRadius),
		statePosition.y * (1 + 5 * 0.93 / stateRadius),
		statePosition.z * (1 + 5 * 0.93 / stateRadius),
	)
	const proxy = new LineSegments(boxGeometry(1.5), new LineGlowMaterial())
	proxy.position.copy(proxyPosition)
	shell.add(proxy)
	geometries.push({atomId, geometry: proxy.geometry, node: proxy})

	const fieldPosition = positions.get(`field:${atomId}:0`)!
	const transition = new LineSegments(geometryFromPoints([
		new Vector3(fieldPosition.x, fieldPosition.y, fieldPosition.z),
		new Vector3(statePosition.x, statePosition.y, statePosition.z),
	]), new LineGlowMaterial())
	shell.add(transition)
	geometries.push({atomId, geometry: transition.geometry, node: transition})

	const relation = new LineSegments(geometryFromPoints([
		new Vector3(fieldPosition.x, fieldPosition.y, fieldPosition.z),
		proxyPosition,
	]), new LineGlowMaterial())
	shell.add(relation)
	geometries.push({atomId, geometry: relation.geometry, node: relation})
	return torus
}

describe("owning Atom visual fit", () => {
	test("fits all owned root and nested Chat Send geometry in a portrait viewport", () => {
		const scene = new Object3D()
		const root = new Object3D()
		root.position.set(0, 0, 1100)
		scene.add(root)
		const chatSend = new Object3D()
		chatSend.position.set(22, -14, 3)
		chatSend.scale.set(0.1, 0.1, 0.1)
		root.add(chatSend)
		const geometries: OwnedAtomFitGeometry[] = []
		const spheres: OwnedAtomFitSphere[] = []
		const rootTorus = addAtomVisualFixture(2, root, geometries, spheres)
		const chatSendTorus = addAtomVisualFixture(12, chatSend, geometries, spheres)

		const unrelated = new LineSegments(boxGeometry(500), new LineGlowMaterial())
		unrelated.position.set(50_000, 0, 0)
		scene.add(unrelated)
		geometries.push({atomId: 99, geometry: unrelated.geometry, node: unrelated})
		scene.updateWorldMatrix(true)

		const defaultPosition = new Vector3(
			bulkLayoutConfig.viewport.camera.position.x,
			bulkLayoutConfig.viewport.camera.position.y,
			bulkLayoutConfig.viewport.camera.position.z,
		)
		const defaultTarget = new Vector3(
			bulkLayoutConfig.viewport.camera.target.x,
			bulkLayoutConfig.viewport.camera.target.y,
			bulkLayoutConfig.viewport.camera.target.z,
		)
		const rootCenter = worldCenter(rootTorus)
		const rootBounds = resolveOwnedAtomVisualFitBounds(2, rootCenter, geometries, spheres)
		const torusOnlyRootBounds = resolveOwnedAtomVisualFitBounds(
			2,
			rootCenter,
			geometries.filter((item) => item.node === rootTorus),
			[],
		)
		const oldRootPose = resolveBulkViewportFitPose({
			aspect: PORTRAIT_ASPECT,
			centerProjectedBounds: false,
			currentPosition: defaultPosition,
			currentTarget: defaultTarget,
			fovRad: bulkLayoutConfig.viewport.camera.fovRad,
			points: torusOnlyRootBounds.points,
			radius: torusOnlyRootBounds.radius,
			target: rootCenter,
			up: new Vector3(0, 0, 1),
		})
		const rootPose = resolveBulkViewportFitPose({
			aspect: PORTRAIT_ASPECT,
			centerProjectedBounds: false,
			currentPosition: defaultPosition,
			currentTarget: defaultTarget,
			fovRad: bulkLayoutConfig.viewport.camera.fovRad,
			points: rootBounds.points,
			radius: rootBounds.radius,
			target: rootCenter,
			up: new Vector3(0, 0, 1),
		})

		expect(maximumProjectedExtent(oldRootPose.position, oldRootPose.target, rootBounds.points))
			.toBeGreaterThan(1)
		expect(rootPose.target).toEqual(rootCenter)
		expect(maximumProjectedExtent(rootPose.position, rootPose.target, rootBounds.points))
			.toBeLessThanOrEqual(1 + FIT_EPSILON)
		expect(rootBounds.radius).toBeLessThan(100)

		const chatSendCenter = worldCenter(chatSendTorus)
		const chatSendBounds = resolveOwnedAtomVisualFitBounds(12, chatSendCenter, geometries, spheres)
		const torusOnlyChatSendBounds = resolveOwnedAtomVisualFitBounds(
			12,
			chatSendCenter,
			geometries.filter((item) => item.node === chatSendTorus),
			[],
		)
		const nestedDirection = defaultPosition.clone().sub(defaultTarget).normalize()
		const nestedCurrentPosition = chatSendCenter.clone().add(nestedDirection.multiplyScalar(500))
		const oldNestedPose = resolveBulkViewportFitPose({
			aspect: PORTRAIT_ASPECT,
			centerProjectedBounds: false,
			currentPosition: nestedCurrentPosition,
			currentTarget: chatSendCenter,
			fitAxis: "width",
			fovRad: bulkLayoutConfig.viewport.camera.fovRad,
			paddingRatio: 1.25,
			points: torusOnlyChatSendBounds.points,
			radius: torusOnlyChatSendBounds.radius,
			target: chatSendCenter,
			up: new Vector3(0, 0, 1),
		})
		const nestedPose = resolveBulkViewportFitPose({
			aspect: PORTRAIT_ASPECT,
			centerProjectedBounds: false,
			currentPosition: nestedCurrentPosition,
			currentTarget: chatSendCenter,
			fitAxis: "width",
			fovRad: bulkLayoutConfig.viewport.camera.fovRad,
			paddingRatio: 1.25,
			points: chatSendBounds.points,
			radius: chatSendBounds.radius,
			target: chatSendCenter,
			up: new Vector3(0, 0, 1),
		})

		expect(maximumProjectedExtent(oldNestedPose.position, oldNestedPose.target, chatSendBounds.points))
			.toBeGreaterThan(1)
		expect(nestedPose.target).toEqual(chatSendCenter)
		expect(maximumProjectedExtent(nestedPose.position, nestedPose.target, chatSendBounds.points))
			.toBeLessThanOrEqual(1 + FIT_EPSILON)
		expect(chatSendBounds.radius).toBeLessThan(10)
	})
})
