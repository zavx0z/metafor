export type DisplayMode = "far" | "near"

export const DISPLAY_CENTER_MM = Object.freeze({x: 0, y: 0, z: 900})
export const DISPLAY_NEAR_DISTANCE_MM = 600
export const DISPLAY_FOV = Math.PI / 4

/** Начальный пространственный обзор Cosmos в мм, Z-up. */
export const INITIAL_VIEW_POINT = Object.freeze({
  position: Object.freeze({x: 0, y: -1600, z: 900}),
  target: DISPLAY_CENTER_MM,
  fov: DISPLAY_FOV,
  near: 1,
  far: 5000,
})

export function displayMillimetersPerPixel(height: number): number {
  return 2 * DISPLAY_NEAR_DISTANCE_MM * Math.tan(DISPLAY_FOV / 2) / positiveExtent(height)
}

function positiveExtent(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 1
}
