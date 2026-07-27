import {Object3D} from "@metafor/engine"

export type ShellMarkerSpec = Readonly<{
	identity: string
	radius: number
}>

export type OwnedShellMarkerSpec = ShellMarkerSpec & Readonly<{
	atomId: number
}>

export type AtomShellSpec = Readonly<{
	atomId: number
	torusOuterRadius: number
}>

export type ShellMarkerPosition = Readonly<{
	x: number
	y: number
	z: number
}>

export type AtomMarkerShell = Readonly<{
	atomId: number
	center: ShellMarkerPosition
	positions: ReadonlyMap<string, ShellMarkerPosition>
	radius: number
}>

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export const createAtomMarkerShellFrame = (atomId: number): Object3D => {
	const markerShell = new Object3D()
	markerShell.name = `AtomMarkerShell:${atomId}`
	markerShell.updateMatrix()
	return markerShell
}

const stableHash = (value: string): number => {
	let hash = 0x811c9dc5
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return hash >>> 0
}

/**
 * Builds a spherical shell outside a torus centered at the same origin. The
 * radius expands strictly with occupancy and is bounded by marker scale.
 */
export const resolveMarkerShellRadius = (
	markerCount: number,
	centeredTorusOuterRadius: number,
	maxMarkerRadius: number,
): number => {
	const count = Math.max(1, Math.floor(markerCount))
	const torusOuterRadius = Math.max(0, centeredTorusOuterRadius)
	const marker = Math.max(0.001, maxMarkerRadius)
	return torusOuterRadius + marker * (0.45 + 0.82 * Math.sqrt(count))
}

/**
 * Deterministic equal-area distribution. Identity hashes determine ordering,
 * while every returned point remains exactly on the derived shell.
 */
export const resolveShellMarkerPositions = (
	markers: readonly ShellMarkerSpec[],
	centeredTorusOuterRadius: number,
): ReadonlyMap<string, ShellMarkerPosition> => {
	if (markers.length === 0) return new Map()
	const ordered = [...markers].sort((left, right) =>
		stableHash(left.identity) - stableHash(right.identity) ||
		left.identity.localeCompare(right.identity),
	)
	const maxMarkerRadius = Math.max(...ordered.map((marker) => marker.radius))
	const shellRadius = resolveMarkerShellRadius(
		ordered.length,
		centeredTorusOuterRadius,
		maxMarkerRadius,
	)
	const positions = new Map<string, ShellMarkerPosition>()
	for (let index = 0; index < ordered.length; index += 1) {
		const marker = ordered[index]!
		const y = 1 - (2 * (index + 0.5)) / ordered.length
		const radial = Math.sqrt(Math.max(0, 1 - y * y))
		const angle = GOLDEN_ANGLE * index
		positions.set(marker.identity, {
			x: Math.cos(angle) * radial * shellRadius,
			y: y * shellRadius,
			z: Math.sin(angle) * radial * shellRadius,
		})
	}
	return positions
}

/**
 * Resolves one independent, origin-centered shell per owning Atom. Positions
 * are local to that Atom's identity shell frame, never another Atom's frame.
 */
export const resolvePerAtomMarkerShells = (
	atoms: readonly AtomShellSpec[],
	markers: readonly OwnedShellMarkerSpec[],
): ReadonlyMap<number, AtomMarkerShell> => {
	const markersByAtom = new Map<number, OwnedShellMarkerSpec[]>()
	for (const marker of markers) {
		const owned = markersByAtom.get(marker.atomId) ?? []
		owned.push(marker)
		markersByAtom.set(marker.atomId, owned)
	}
	const shells = new Map<number, AtomMarkerShell>()
	for (const atom of atoms) {
		const owned = markersByAtom.get(atom.atomId) ?? []
		if (owned.length === 0) continue
		const maxMarkerRadius = Math.max(...owned.map((marker) => marker.radius))
		const radius = resolveMarkerShellRadius(
			owned.length,
			atom.torusOuterRadius,
			maxMarkerRadius,
		)
		shells.set(atom.atomId, {
			atomId: atom.atomId,
			center: {x: 0, y: 0, z: 0},
			positions: resolveShellMarkerPositions(owned, atom.torusOuterRadius),
			radius,
		})
	}
	return shells
}
