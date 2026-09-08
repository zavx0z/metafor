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

/** Постоянные характеристики активной поверхности, независимо от окна и камеры. */
export const DISPLAY_SIZE_MM = Object.freeze({width: 600, height: 337.5})
export const DISPLAY_RESOLUTION = Object.freeze({width: 1280, height: 720})
