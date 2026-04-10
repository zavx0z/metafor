import {BufferGeometry} from "./BufferGeometry"
import {Material} from "../materials"
import {Mesh} from "./Mesh"
import {Skeleton} from "../animation"

export class SkinnedMesh extends Mesh {
  public readonly isSkinnedMesh = true
  public skeleton: Skeleton

  constructor(geometry: BufferGeometry, material: Material | Material[], skeleton: Skeleton) {
    super(geometry, material)
    this.skeleton = skeleton
  }
}