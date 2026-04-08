import { Matrix4 } from "../math/Matrix4"
import { Object3D } from "../core/Object3D"

export class Skeleton {
  public bones: Object3D[] = []
  public boneInverses: Matrix4[] = []
  public boneMatrices: Float32Array

  constructor(bones: Object3D[] = [], boneInverses: Matrix4[] = []) {
    this.bones = bones
    this.boneInverses = boneInverses
    this.boneMatrices = new Float32Array(bones.length * 16)
  }

  public update(): void {
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i]
      const matrix = new Matrix4().multiplyMatrices(bone.matrixWorld, this.boneInverses[i])
      this.boneMatrices.set(matrix.elements, i * 16)
    }
  }
}
