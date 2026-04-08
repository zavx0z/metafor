import { Vector3 } from "./Vector3"
import { Matrix4 } from "./Matrix4"

export class Sphere {
  constructor(public center: Vector3 = new Vector3(), public radius: number = -1) {}

  public set(center: Vector3, radius: number): this {
    this.center.copy(center)
    this.radius = radius
    return this
  }

  public copy(sphere: Sphere): this {
    this.center.copy(sphere.center)
    this.radius = sphere.radius
    return this
  }

  public clone(): Sphere {
    return new Sphere().copy(this)
  }

  public applyMatrix4(matrix: Matrix4): this {
    this.center.applyMatrix4(matrix)
    this.radius = this.radius * matrix.getMaxScaleOnAxis()
    return this
  }
}