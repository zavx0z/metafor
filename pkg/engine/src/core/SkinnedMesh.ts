import {BufferGeometry} from "./BufferGeometry"
import {Material} from "../materials"
import {Mesh} from "./Mesh"
import {Skeleton} from "../animation"

/**
 * A mesh deformed by one skeleton before its normal model transform.
 *
 * The renderer pairs `skeleton.bones` with `skeleton.boneInverses`, converts
 * them into mesh-local matrices and uploads at most 128 pairs. Ordinary
 * {@link Mesh} instances never upload a bone block.
 *
 * @see ../renderer/per-object-upload.spec.ts
 */
export class SkinnedMesh extends Mesh {
  public readonly isSkinnedMesh = true
  public skeleton: Skeleton

  constructor(geometry: BufferGeometry, material: Material | Material[], skeleton: Skeleton) {
    super(geometry, material)
    this.skeleton = skeleton
  }
}
