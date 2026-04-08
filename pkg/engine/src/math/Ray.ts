import { Vector3 } from "./Vector3"
import { Sphere } from "./Sphere"
import { Matrix4 } from "./Matrix4"
import { Plane } from "./Plane"

export class Ray {
  constructor(public origin: Vector3 = new Vector3(), public direction: Vector3 = new Vector3(0, 0, -1)) {}

  public set(origin: Vector3, direction: Vector3): this {
    this.origin.copy(origin)
    this.direction.copy(direction)
    return this
  }

  public at(t: number, target: Vector3): Vector3 {
    return target.copy(this.direction).multiplyScalar(t).add(this.origin)
  }

  public lookAt(v: Vector3): this {
    this.direction.copy(v).sub(this.origin).normalize()
    return this
  }

  public distanceToPoint(point: Vector3): number {
    return Math.sqrt(this.distanceSqToPoint(point))
  }

  public distanceSqToPoint(point: Vector3): number {
    const directionDistance = point.clone().sub(this.origin).dot(this.direction)

    if (directionDistance < 0) {
      return this.origin.distanceToSquared(point)
    }

    const projection = this.direction.clone().multiplyScalar(directionDistance).add(this.origin)
    return projection.distanceToSquared(point)
  }

  public intersectSphere(sphere: Sphere, target: Vector3): Vector3 | null {
    const v1 = new Vector3().subVectors(sphere.center, this.origin)
    const tca = v1.dot(this.direction)
    const d2 = v1.dot(v1) - tca * tca
    const radius2 = sphere.radius * sphere.radius

    if (d2 > radius2) return null

    const thc = Math.sqrt(radius2 - d2)

    // t0 = first intersect point - entrance on front of sphere
    const t0 = tca - thc

    // t1 = second intersect point - exit point on back of sphere
    const t1 = tca + thc

    // test to see if both t0 and t1 are behind the ray - if so, return null
    if (t0 < 0 && t1 < 0) return null

    // test to see if t0 is behind the ray: if so, the ray is inside the sphere, so return the second exit point scaled by t1
    if (t0 < 0) return this.at(t1, target)

    // otherwise, return the point of intersection
    return this.at(t0, target)
  }

  public intersectPlane(plane: Plane, target: Vector3): Vector3 | null {
    const denominator = plane.normal.dot(this.direction)

    if (denominator === 0) {
      // ray is coplanar, assume no intersection
      return null
    }

    const t = -(this.origin.dot(plane.normal) + plane.constant) / denominator

    if (t < 0) {
      return null
    }

    return this.at(t, target)
  }

  public applyMatrix4(matrix4: Matrix4): this {
    this.origin.applyMatrix4(matrix4)
    this.direction.applyMatrix4(matrix4).sub(this.origin).normalize()
    return this
  }
}