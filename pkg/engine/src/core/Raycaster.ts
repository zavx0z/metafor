import { Ray } from "../math/Ray"
import { Vector3 } from "../math/Vector3"
import { ViewPoint } from "./ViewPoint"
import { Object3D } from "./Object3D"
import { Matrix4 } from "../math/Matrix4"

export interface Intersection {
  distance: number
  point: Vector3
  object: Object3D
  faceIndex?: number
  instanceId?: number
}

export class Raycaster {
  public ray: Ray
  public near: number
  public far: number

  constructor(origin?: Vector3, direction?: Vector3, near: number = 0, far: number = Infinity) {
    this.ray = new Ray(origin, direction)
    this.near = near
    this.far = far
  }

  public setFromCamera(coords: { x: number; y: number }, camera: ViewPoint): void {
    if (camera.projectionMatrix) {
      this.ray.origin.set(coords.x, coords.y, 0)
      this.ray.direction.set(coords.x, coords.y, 0.5)
      
      // Unproject
      const inverseProj = new Matrix4().copy(camera.projectionMatrix).invert()
      const inverseView = new Matrix4().copy(camera.viewMatrix).invert()
      
      // Clip space -> View space
      this.ray.origin.applyMatrix4(inverseProj)
      this.ray.direction.applyMatrix4(inverseProj)
      
      // View space -> World space
      this.ray.origin.applyMatrix4(inverseView)
      this.ray.direction.applyMatrix4(inverseView)
      
      this.ray.direction.sub(this.ray.origin).normalize()
    }
  }

  public intersectObject(object: Object3D, recursive: boolean = true, intersects: Intersection[] = []): Intersection[] {
    if (!object.visible) return intersects

    object.raycast(this, intersects)

    if (recursive) {
      for (const child of object.children) {
        this.intersectObject(child, recursive, intersects)
      }
    }

    intersects.sort((a, b) => a.distance - b.distance)
    return intersects
  }

  public intersectObjects(objects: Object3D[], recursive: boolean = true, intersects: Intersection[] = []): Intersection[] {
    for (const object of objects) {
      this.intersectObject(object, recursive, intersects)
    }
    intersects.sort((a, b) => a.distance - b.distance)
    return intersects
  }
}