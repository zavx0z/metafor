import type {XRViewPointElement} from "@zavx0z/space"

export type DisplayMode = "far" | "near"
type Vector = Readonly<{x: number; y: number; z: number}>

/** Положение камеры в правой системе Z-up; расстояния заданы в мм. */
export type ViewPointPose = Readonly<{
  position: Vector
  target: Vector
  fov: number
  near: number
  far: number
}>

export const DISPLAY_CENTER_MM = Object.freeze({x: 0, y: 0, z: 900})
export const DISPLAY_NEAR_DISTANCE_MM = 600
export const DISPLAY_FOV = Math.PI / 4

export const INITIAL_VIEW_POINT: ViewPointPose = Object.freeze({
  position: Object.freeze({x: 0, y: -1600, z: 900}),
  target: DISPLAY_CENTER_MM,
  fov: DISPLAY_FOV,
  near: 1,
  far: 5000,
})

/**
Приближает камеру к центру основного Display на 600 мм по текущему направлению.
Сохранённый дальний обзор принадлежит компоненту; функция не создаёт подписок.
*/
export function nearViewPoint(current: ViewPointPose): ViewPointPose {
  const offset = {
    x: current.position.x - DISPLAY_CENTER_MM.x,
    y: current.position.y - DISPLAY_CENTER_MM.y,
    z: current.position.z - DISPLAY_CENTER_MM.z,
  }
  const scale = DISPLAY_NEAR_DISTANCE_MM / Math.max(Math.hypot(offset.x, offset.y, offset.z), 0.001)
  return {
    ...current,
    position: {
      x: DISPLAY_CENTER_MM.x + offset.x * scale,
      y: DISPLAY_CENTER_MM.y + offset.y * scale,
      z: DISPLAY_CENTER_MM.z + offset.z * scale,
    },
    target: DISPLAY_CENTER_MM,
  }
}

/** Применяется внутри transaction того же semantic Document. */
export function writeViewPoint(viewPoint: XRViewPointElement, pose: ViewPointPose): void {
  viewPoint.x = pose.position.x
  viewPoint.y = pose.position.y
  viewPoint.z = pose.position.z
  viewPoint.targetX = pose.target.x
  viewPoint.targetY = pose.target.y
  viewPoint.targetZ = pose.target.z
  viewPoint.fov = pose.fov
  viewPoint.near = pose.near
  viewPoint.far = pose.far
}

export function readViewPoint(viewPoint: XRViewPointElement): ViewPointPose {
  return Object.freeze({
    position: Object.freeze({x: viewPoint.x, y: viewPoint.y, z: viewPoint.z}),
    target: Object.freeze({x: viewPoint.targetX, y: viewPoint.targetY, z: viewPoint.targetZ}),
    fov: viewPoint.fov,
    near: viewPoint.near,
    far: viewPoint.far,
  })
}

export function displayMillimetersPerPixel(height: number): number {
  return 2 * DISPLAY_NEAR_DISTANCE_MM * Math.tan(DISPLAY_FOV / 2) / positiveExtent(height)
}

function positiveExtent(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 1
}
