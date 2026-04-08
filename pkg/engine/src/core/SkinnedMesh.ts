import { BufferGeometry } from "./BufferGeometry";
import { Material } from "../materials/Material";
import { Mesh } from "./Mesh";
import { Skeleton } from "../animation/Skeleton";

export class SkinnedMesh extends Mesh {
  public readonly isSkinnedMesh = true;
  public skeleton: Skeleton;

  constructor(geometry: BufferGeometry, material: Material | Material[], skeleton: Skeleton) {
    super(geometry, material);
    this.skeleton = skeleton;
  }
}