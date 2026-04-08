import { BufferGeometry, BufferAttribute } from "./BufferGeometry"
import { Object3D } from "./Object3D"
import { Vector3 } from "../math/Vector3"
import { LineGlowMaterial } from "../materials/LineGlowMaterial"
import { Color } from "../math/Color"
import { Raycaster, Intersection } from "./Raycaster"
import { Matrix4 } from "../math/Matrix4"
import { Sphere } from "../math/Sphere"

export class WireframeInstancedMesh extends Object3D {
  public readonly isWireframeInstancedMesh: true = true
  public geometry: BufferGeometry
  public material: LineGlowMaterial | LineGlowMaterial[]
  public instanceMatrix: Float32Array
  public instanceMaterialParams: Float32Array
  public count: number
  private instanceBufferNeedsUpdate: boolean = false
  private instanceCombinedBuffer: Float32Array

  constructor(geometry: BufferGeometry, material: LineGlowMaterial | LineGlowMaterial[], count: number) {
    super()
    this.geometry = geometry
    this.count = count

    // Проверяем тип материала
    if (Array.isArray(material)) {
      if (material.length !== count) {
        throw new Error(
          `WireframeInstancedMesh: количество материалов (${material.length}) должно соответствовать количеству инстансов (${count})`,
        )
      }
      this.material = material
    } else {
      // Сохраняем один материал (для обратной совместимости)
      this.material = material
    }

    // Инициализируем буферы
    this.instanceMatrix = new Float32Array(count * 16)
    this.instanceMaterialParams = new Float32Array(count * 9) // 9 floats на инстанс: color(4), glowIntensity(1), glowColor(4)
    this.instanceCombinedBuffer = new Float32Array(count * 25)
    this.geometry.setAttribute("instanceBuffer", new BufferAttribute(this.instanceCombinedBuffer, 25))

    // Инициализируем единичными матрицами и параметрами материалов
    for (let i = 0; i < count; i++) {
      const matrixOffset = i * 16
      this.instanceMatrix.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], matrixOffset)

      this.updateMaterialParamsAt(i)
    }

    // Добавляем атрибуты инстансов в геометрию
    this.updateInstanceBuffer()
  }

  public setMatrixAt(index: number, matrix: Matrix4): void {
    if (index >= this.count || index < 0) {
      throw new Error(`WireframeInstancedMesh.setMatrixAt: index ${index} out of range (0-${this.count - 1})`)
    }

    const offset = index * 16
    this.instanceMatrix.set(matrix.elements, offset)
    this.instanceBufferNeedsUpdate = true
  }

  public setPositionAt(index: number, position: Vector3): void {
    if (index >= this.count || index < 0) {
      throw new Error(`WireframeInstancedMesh.setPositionAt: index ${index} out of range (0-${this.count - 1})`)
    }

    const offset = index * 16 + 12
    this.instanceMatrix[offset] = position.x
    this.instanceMatrix[offset + 1] = position.y
    this.instanceMatrix[offset + 2] = position.z
    this.instanceBufferNeedsUpdate = true
  }

  public setMaterialAt(index: number, material: LineGlowMaterial): void {
    if (index >= this.count || index < 0) {
      throw new Error(`WireframeInstancedMesh.setMaterialAt: index ${index} out of range (0-${this.count - 1})`)
    }

    if (Array.isArray(this.material)) {
      this.material[index] = material
    } else {
      // Если изначально был один материал, преобразуем в массив
      const materials = new Array(this.count)
      for (let i = 0; i < this.count; i++) {
        materials[i] = i === index ? material : this.material
      }
      this.material = materials
    }

    this.updateMaterialParamsAt(index)
    this.instanceBufferNeedsUpdate = true
  }

  public setColorAt(index: number, color: Color): void {
    if (index >= this.count || index < 0) {
      throw new Error(`WireframeInstancedMesh.setColorAt: index ${index} out of range (0-${this.count - 1})`)
    }

    const offset = index * 9
    this.instanceMaterialParams[offset] = color.r
    this.instanceMaterialParams[offset + 1] = color.g
    this.instanceMaterialParams[offset + 2] = color.b
    // opacity остается прежним
    this.instanceBufferNeedsUpdate = true
  }

  public setGlowIntensityAt(index: number, intensity: number): void {
    if (index >= this.count || index < 0) {
      throw new Error(`WireframeInstancedMesh.setGlowIntensityAt: index ${index} out of range (0-${this.count - 1})`)
    }

    const offset = index * 9 + 4
    this.instanceMaterialParams[offset] = intensity
    this.instanceBufferNeedsUpdate = true
  }

  public setGlowColorAt(index: number, color: Color): void {
    if (index >= this.count || index < 0) {
      throw new Error(`WireframeInstancedMesh.setGlowColorAt: index ${index} out of range (0-${this.count - 1})`)
    }

    const offset = index * 9 + 5
    this.instanceMaterialParams[offset] = color.r
    this.instanceMaterialParams[offset + 1] = color.g
    this.instanceMaterialParams[offset + 2] = color.b
    this.instanceMaterialParams[offset + 3] = color.a
    this.instanceBufferNeedsUpdate = true
  }

  private updateMaterialParamsAt(index: number): void {
    const material = Array.isArray(this.material) ? this.material[index] : this.material
    const offset = index * 9

    // Цвет материала (4 floats: rgba)
    this.instanceMaterialParams[offset] = material.color.r
    this.instanceMaterialParams[offset + 1] = material.color.g
    this.instanceMaterialParams[offset + 2] = material.color.b
    this.instanceMaterialParams[offset + 3] = material.opacity

    // Интенсивность свечения (1 float)
    this.instanceMaterialParams[offset + 4] = material.glowIntensity

    // Цвет свечения (4 floats: rgba)
    if (material.glowColor) {
      this.instanceMaterialParams[offset + 5] = material.glowColor.r
      this.instanceMaterialParams[offset + 6] = material.glowColor.g
      this.instanceMaterialParams[offset + 7] = material.glowColor.b
      this.instanceMaterialParams[offset + 8] = material.glowColor.a
    } else {
      this.instanceMaterialParams[offset + 5] = 0
      this.instanceMaterialParams[offset + 6] = 0
      this.instanceMaterialParams[offset + 7] = 0
      this.instanceMaterialParams[offset + 8] = 0
    }
  }

  public updateInstanceBuffer(): void {
    const instanceBuffer = this.instanceCombinedBuffer

    for (let i = 0; i < this.count; i++) {
      const instanceOffset = i * 25
      const matrixOffset = i * 16
      const materialOffset = i * 9

      // Копируем матрицу
      instanceBuffer.set(this.instanceMatrix.subarray(matrixOffset, matrixOffset + 16), instanceOffset)

      // Копируем параметры материала
      instanceBuffer.set(this.instanceMaterialParams.subarray(materialOffset, materialOffset + 9), instanceOffset + 16)
    }

    // Устанавливаем флаг обновления для существующего атрибута
    if (this.geometry.attributes.instanceBuffer) {
      this.geometry.attributes.instanceBuffer.needsUpdate = true
    }
    this.instanceBufferNeedsUpdate = false
  }

  public update(): void {
    if (this.instanceBufferNeedsUpdate) {
      this.updateInstanceBuffer()
    }
  }

  public raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    if (this.geometry.boundingSphere === null) this.geometry.computeBoundingSphere()
    const baseSphere = this.geometry.boundingSphere!
    const matrixWorld = this.matrixWorld
    const tempMatrix = new Matrix4()
    const tempSphere = new Sphere()
    const tempVector = new Vector3()

    for (let i = 0; i < this.count; i++) {
      const offset = i * 16
      tempMatrix.elements.set(this.instanceMatrix.subarray(offset, offset + 16))

      // Комбинируем мировую матрицу объекта и локальную матрицу инстанса
      const finalMatrix = new Matrix4().multiplyMatrices(matrixWorld, tempMatrix)

      // Трансформируем сферу
      tempSphere.copy(baseSphere).applyMatrix4(finalMatrix)

      if (raycaster.ray.intersectSphere(tempSphere, tempVector) !== null) {
        intersects.push({
          distance: raycaster.ray.origin.distanceTo(tempSphere.center),
          point: tempVector.clone(),
          object: this,
          instanceId: i,
        })
      }
    }
  }
}
