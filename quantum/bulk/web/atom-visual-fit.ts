import {BufferGeometry, Object3D, Vector3} from "@engine/core"

export type OwnedAtomFitGeometry = Readonly<{
	atomId: number
	geometry: BufferGeometry
	node: Object3D
}>

export type OwnedAtomFitSphere = Readonly<{
	atomId: number
	node: Object3D
	radius: number
}>

export type AtomVisualFitBounds = Readonly<{
	points: readonly Vector3[]
	radius: number
}>

const BOX_SIGNS = [-1, 1] as const

const appendWorldGeometry = (
	points: Vector3[],
	node: Object3D,
	geometry: BufferGeometry,
): void => {
	const attribute = geometry.attributes.position
	if (!attribute || attribute.itemSize < 3 || attribute.count <= 0) return
	for (let vertex = 0; vertex < attribute.count; vertex += 1) {
		const offset = vertex * attribute.itemSize
		const x = Number(attribute.array[offset])
		const y = Number(attribute.array[offset + 1])
		const z = Number(attribute.array[offset + 2])
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
		points.push(new Vector3(x, y, z).applyMatrix4(node.matrixWorld))
	}
}

const appendWorldSphereCube = (
	points: Vector3[],
	node: Object3D,
	radius: number,
): void => {
	for (const xSign of BOX_SIGNS) {
		for (const ySign of BOX_SIGNS) {
			for (const zSign of BOX_SIGNS) {
				points.push(new Vector3(
					xSign * radius,
					ySign * radius,
					zSign * radius,
				).applyMatrix4(node.matrixWorld))
			}
		}
	}
}

/**
 * Resolves one conservative final-world visual envelope for an owning Atom.
 * Geometry contributes its exact render vertices. Sphere cubes deliberately
 * over-bound marker surfaces, so every owned primitive remains inside the fit
 * without a camera-dependent sampling law.
 */
export const resolveOwnedAtomVisualFitBounds = (
	atomId: number,
	center: Vector3,
	geometries: readonly OwnedAtomFitGeometry[],
	spheres: readonly OwnedAtomFitSphere[],
): AtomVisualFitBounds => {
	const points: Vector3[] = []
	for (const item of geometries) {
		if (item.atomId !== atomId) continue
		appendWorldGeometry(points, item.node, item.geometry)
	}
	for (const item of spheres) {
		if (item.atomId !== atomId) continue
		const radius = Math.max(0, item.radius)
		appendWorldSphereCube(points, item.node, radius)
	}
	return {
		points,
		radius: points.reduce(
			(maxRadius, point) => Math.max(maxRadius, point.distanceTo(center)),
			0,
		),
	}
}
