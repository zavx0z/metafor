import { Vector3 } from "./Vector3"
import { Sphere } from "./Sphere"

export class Plane {
  constructor(public normal: Vector3 = new Vector3(1, 0, 0), public constant: number = 0) {}

  public normalize(): this {
    const inverseNormalLength = 1.0 / this.normal.length()
    this.normal.multiplyScalar(inverseNormalLength)
    this.constant *= inverseNormalLength
    return this
  }

  public distanceToPoint(point: Vector3): number {
    return this.normal.dot(point) + this.constant
  }

  public intersectsSphere(sphere: Sphere): boolean {
    return this.distanceToPoint(sphere.center) > -sphere.radius
  }

  public setComponents(x: number, y: number, z: number, w: number): this {
    this.normal.set(x, y, z)
    this.constant = w
    return this
  }
}