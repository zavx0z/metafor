import {Matrix4, Object3D, Vector3, type ViewPoint} from "@metafor/engine"
import {UIDisplay} from "./UIDisplay.ts"

export interface HUDOptions {
  distanceMm?: number
  widthMm?: number
  heightMm?: number
  pixelWidth?: number
  pixelHeight?: number
}

const DEFAULT_DISTANCE_MM = 600

const hasDisplaySize = (
  options: HUDOptions,
): options is HUDOptions & Required<Pick<HUDOptions, "widthMm" | "heightMm" | "pixelWidth" | "pixelHeight">> =>
  options.widthMm !== undefined &&
  options.heightMm !== undefined &&
  options.pixelWidth !== undefined &&
  options.pixelHeight !== undefined

/**
 * HUD — camera/head-locked корень, который рендерится поверх Space в том же canvas.
 */
export class HUD extends Object3D {
  public readonly isHUD: true = true
  public readonly display?: UIDisplay
  public distanceMm: number

  constructor(options: HUDOptions = {}) {
    super()
    this.distanceMm = options.distanceMm ?? DEFAULT_DISTANCE_MM
    this.frustumCulled = false

    if (hasDisplaySize(options)) {
      this.display = new UIDisplay({
        widthMm: options.widthMm,
        heightMm: options.heightMm,
        pixelWidth: options.pixelWidth,
        pixelHeight: options.pixelHeight,
      })
      this.add(this.display)
    }
  }

  public updateForViewPoint(viewPoint: ViewPoint): void {
    const forward = new Vector3()
      .subVectors(viewPoint.getTarget(), viewPoint.position)
      .normalize()

    if (forward.length() === 0) return

    const center = viewPoint.position
      .clone()
      .add(forward.clone().multiplyScalar(this.distanceMm))

    const zAxis = forward.clone().negate().normalize()
    const viewUp = viewPoint.getUp().clone().normalize()
    let xAxis = new Vector3().crossVectors(viewUp, zAxis).normalize()

    if (xAxis.length() === 0) {
      xAxis = new Vector3(1, 0, 0)
    }

    const yAxis = new Vector3().crossVectors(zAxis, xAxis).normalize()
    const rotationMatrix = new Matrix4().set(
      xAxis.x, yAxis.x, zAxis.x, 0,
      xAxis.y, yAxis.y, zAxis.y, 0,
      xAxis.z, yAxis.z, zAxis.z, 0,
      0, 0, 0, 1,
    )

    this.position.copy(center)
    this.quaternion.setFromRotationMatrix(rotationMatrix)
    this.updateWorldMatrix(true)
  }
}
