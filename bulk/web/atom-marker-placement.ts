export type AtomMarkerPlacementInput = Readonly<{
	localX: number
	localY: number
	localZ: number
}>

export type AtomMarkerPosition = Readonly<{
	x: number
	y: number
	z: number
}>

/**
 * Keeps the manifestation-authored position inside the owning Atom frame.
 * Fields therefore stay in the packed nucleus and State markers retain their
 * toroidal composition instead of being remapped onto a renderer-only sphere.
 */
export const resolveAtomMarkerPosition = (
	marker: AtomMarkerPlacementInput,
): AtomMarkerPosition => ({
	x: marker.localX,
	y: marker.localY,
	z: marker.localZ,
})
