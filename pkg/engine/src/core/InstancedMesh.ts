import { BufferGeometry, BufferAttribute } from "./BufferGeometry"
import { Material } from "../materials/Material"
import { Mesh } from "./Mesh"
import { Matrix4 } from "../math/Matrix4"
import { Quaternion } from "../math/Quaternion"
import { Vector3 } from "../math/Vector3"

export class InstancedMesh extends Mesh {
  public readonly isInstancedMesh: true = true
  public instanceMatrix: Float32Array
  public count: number

  constructor(geometry: BufferGeometry, material: Material | Material[], count: number) {
    super(geometry, material)
    this.count = count
    this.instanceMatrix = new Float32Array(count * 16)
    
    // Инициализируем единичными матрицами
    for (let i = 0; i < count; i++) {
      const offset = i * 16
      this.instanceMatrix.set([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ], offset)
    }
    
    // Добавляем атрибут матриц инстансов в геометрию
    geometry.setAttribute('instanceMatrix', new BufferAttribute(this.instanceMatrix, 16))
  }

  public setMatrixAt(index: number, matrix: Matrix4): void {
    if (index >= this.count || index < 0) {
      throw new Error(`InstancedMesh.setMatrixAt: index ${index} out of range (0-${this.count-1})`)
    }
    
    const offset = index * 16
    this.instanceMatrix.set(matrix.elements, offset)
  }

  public getMatrixAt(index: number, matrix: Matrix4): void {
    if (index >= this.count || index < 0) {
      throw new Error(`InstancedMesh.getMatrixAt: index ${index} out of range (0-${this.count-1})`)
    }
    
    const offset = index * 16
    matrix.elements.set(this.instanceMatrix.subarray(offset, offset + 16))
  }

  public setPositionAt(index: number, position: Vector3): void {
    if (index >= this.count || index < 0) {
      throw new Error(`InstancedMesh.setPositionAt: index ${index} out of range (0-${this.count-1})`)
    }
    
    const offset = index * 16 + 12
    this.instanceMatrix[offset] = position.x
    this.instanceMatrix[offset + 1] = position.y
    this.instanceMatrix[offset + 2] = position.z
  }

  public setQuaternionAt(index: number, quaternion: Quaternion): void {
    if (index >= this.count || index < 0) {
      throw new Error(`InstancedMesh.setQuaternionAt: index ${index} out of range (0-${this.count-1})`)
    }
    
    // Создаем временную матрицу из кватерниона
    const tempMatrix = new Matrix4()
    tempMatrix.makeRotationFromQuaternion(quaternion)
    
    const offset = index * 16
    const te = tempMatrix.elements
    
    // Копируем только вращательную часть (3x3)
    this.instanceMatrix[offset] = te[0]
    this.instanceMatrix[offset + 1] = te[1]
    this.instanceMatrix[offset + 2] = te[2]
    
    this.instanceMatrix[offset + 4] = te[4]
    this.instanceMatrix[offset + 5] = te[5]
    this.instanceMatrix[offset + 6] = te[6]
    
    this.instanceMatrix[offset + 8] = te[8]
    this.instanceMatrix[offset + 9] = te[9]
    this.instanceMatrix[offset + 10] = te[10]
  }

  public setScaleAt(index: number, scale: Vector3): void {
    if (index >= this.count || index < 0) {
      throw new Error(`InstancedMesh.setScaleAt: index ${index} out of range (0-${this.count-1})`)
    }
    
    const offset = index * 16
    
    // Масштабируем вращательную часть матрицы
    this.instanceMatrix[offset] *= scale.x
    this.instanceMatrix[offset + 1] *= scale.x
    this.instanceMatrix[offset + 2] *= scale.x
    
    this.instanceMatrix[offset + 4] *= scale.y
    this.instanceMatrix[offset + 5] *= scale.y
    this.instanceMatrix[offset + 6] *= scale.y
    
    this.instanceMatrix[offset + 8] *= scale.z
    this.instanceMatrix[offset + 9] *= scale.z
    this.instanceMatrix[offset + 10] *= scale.z
  }
}