import { Quaternion } from "./Quaternion"
import { Matrix4 } from "./Matrix4"

/**
 * Класс для представления 3D-векторов.
 */
export class Vector3 {
  public x: number
  public y: number
  public z: number

  /**
   * Создает экземпляр Vector3.
   * @param x - Значение по оси X.
   * @param y - Значение по оси Y.
   * @param z - Значение по оси Z.
   */
  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x
    this.y = y
    this.z = z
  }

  /**
   * Устанавливает значения компонент вектора.
   * @param x - Значение по оси X.
   * @param y - Значение по оси Y.
   * @param z - Значение по оси Z.
   * @returns Текущий экземпляр вектора.
   */
  public set(x: number, y: number, z: number): this {
    this.x = x
    this.y = y
    this.z = z
    return this
  }

  /**
   * Копирует значения из другого вектора в этот вектор.
   * @param v - Вектор, из которого копируются значения.
   * @returns Текущий экземпляр вектора.
   */
  public copy(v: Vector3): this {
    this.x = v.x
    this.y = v.y
    this.z = v.z
    return this
  }

  /**
   * Создает новый экземпляр Vector3 с такими же значениями.
   * @returns Новый вектор.
   */
  public clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z)
  }

  /**
   * Добавляет вектор к текущему вектору.
   * @param v - Вектор для добавления.
   * @returns Текущий экземпляр вектора.
   */
  public add(v: Vector3): this {
    this.x += v.x
    this.y += v.y
    this.z += v.z
    return this
  }

  /**
   * Вычитает вектор из текущего вектора.
   * @param v - Вектор для вычитания.
   * @returns Текущий экземпляр вектора.
   */
  public sub(v: Vector3): this {
    this.x -= v.x
    this.y -= v.y
    this.z -= v.z
    return this
  }

  /**
   * Устанавливает этот вектор как разность двух векторов.
   * @param a - Первый вектор.
   * @param b - Второй вектор.
   * @returns Текущий экземпляр вектора.
   */
  public subVectors(a: Vector3, b: Vector3): this {
    this.x = a.x - b.x
    this.y = a.y - b.y
    this.z = a.z - b.z
    return this
  }

  /**
   * Умножает текущий вектор на скаляр.
   * @param s - Скаляр.
   * @returns Текущий экземпляр вектора.
   */
  public multiplyScalar(s: number): this {
    this.x *= s
    this.y *= s
    this.z *= s
    return this
  }

  /**
   * Вычисляет скалярное произведение этого вектора и вектора v.
   * @param v - Другой вектор.
   * @returns Скалярное произведение.
   */
  public dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z
  }

  /**
   * Устанавливает этот вектор как векторное произведение this и v.
   * @param v Другой вектор.
   * @returns Текущий экземпляр вектора.
   */
  public cross(v: Vector3): this {
    return this.crossVectors(this, v)
  }

  /**
   * Устанавливает этот вектор как векторное произведение векторов a и b.
   * @param a - Первый вектор.
   * @param b - Второй вектор.
   * @returns Текущий экземпляр вектора.
   */
  public crossVectors(a: Vector3, b: Vector3): this {
    const ax = a.x,
      ay = a.y,
      az = a.z
    const bx = b.x,
      by = b.y,
      bz = b.z
    this.x = ay * bz - az * by
    this.y = az * bx - ax * bz
    this.z = ax * by - ay * bx
    return this
  }

  /**
   * Вычисляет длину вектора.
   * @returns Длина вектора.
   */
  public length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
  }

  /**
   * Нормализует вектор (его длина становится равной 1).
   * @returns Текущий экземпляр вектора.
   */
  public normalize(): this {
    const len = this.length()
    return this.multiplyScalar(len > 0 ? 1 / len : 0)
  }

  /**
   * Устанавливает компоненты вектора из массива.
   * @param array Массив с компонентами.
   * @param offset Смещение в массиве.
   * @returns Текущий экземпляр вектора.
   */
  public fromArray(array: ArrayLike<number>, offset: number = 0): this {
    this.x = array[offset]
    this.y = array[offset + 1]
    this.z = array[offset + 2]
    return this
  }

  /**
   * Записывает компоненты вектора в массив.
   * @param array Массив для записи.
   * @param offset Смещение в массиве.
   * @returns Массив с компонентами.
   */
  public toArray(array: number[] = [], offset: number = 0): number[] {
    array[offset] = this.x
    array[offset + 1] = this.y
    array[offset + 2] = this.z
    return array
  }

  /**
   * Применяет к вектору вращение, заданное кватернионом.
   * @param q Кватернион.
   */
  public applyQuaternion(q: Quaternion): this {
    const x = this.x,
      y = this.y,
      z = this.z
    const qx = q.x,
      qy = q.y,
      qz = q.z,
      qw = q.w
    // Вычисление uv = 2.0 * cross(q.xyz, v)
    const uvx = 2 * (qy * z - qz * y)
    const uvy = 2 * (qz * x - qx * z)
    const uvz = 2 * (qx * y - qy * x)
    // Вычисление v + q.w * uv + cross(q.xyz, uv)
    this.x = x + qw * uvx + (qy * uvz - qz * uvy)
    this.y = y + qw * uvy + (qz * uvx - qx * uvz)
    this.z = z + qw * uvz + (qx * uvy - qy * uvx)
    return this
  }

  /**
   * Инвертирует вектор (умножает все компоненты на -1).
   */
  public negate(): this {
    this.x = -this.x
    this.y = -this.y
    this.z = -this.z
    return this
  }

  public applyMatrix4(m: Matrix4): this {
    const x = this.x,
      y = this.y,
      z = this.z
    const e = m.elements
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15])
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
    return this
  }

  public distanceTo(v: Vector3): number {
    return Math.sqrt(this.distanceToSquared(v))
  }

  public distanceToSquared(v: Vector3): number {
    const dx = this.x - v.x,
      dy = this.y - v.y,
      dz = this.z - v.z
    return dx * dx + dy * dy + dz * dz
  }
}
