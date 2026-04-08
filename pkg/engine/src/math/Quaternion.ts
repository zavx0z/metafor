import { Matrix4 } from "./Matrix4";
import { Vector3 } from "./Vector3";

/**
 * Класс для представления кватернионов.
 */
export class Quaternion {
  public x: number;
  public y: number;
  public z: number;
  public w: number;

  /**
   * Создает экземпляр Quaternion.
   * @param x - Значение по оси X.
   * @param y - Значение по оси Y.
   * @param z - Значение по оси Z.
   * @param w - Значение по оси W.
   */
  constructor(x: number = 0, y: number = 0, z: number = 0, w: number = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * Устанавливает кватернион из углов Эйлера.
   * @param x - Угол вращения вокруг оси X в радианах.
   * @param y - Угол вращения вокруг оси Y в радианах.
   * @param z - Угол вращения вокруг оси Z в радианах.
   */
  public setFromEuler(x: number, y: number, z: number): this {
    const c1 = Math.cos(x / 2);
    const c2 = Math.cos(y / 2);
    const c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2);
    const s2 = Math.sin(y / 2);
    const s3 = Math.sin(z / 2);
    this.x = s1 * c2 * c3 + c1 * s2 * s3;
    this.y = c1 * s2 * c3 - s1 * c2 * s3;
    this.z = c1 * c2 * s3 + s1 * s2 * c3;
    this.w = c1 * c2 * c3 - s1 * s2 * s3;
    return this;
  }

  /**
   * Возвращает компоненты кватерниона в виде массива.
   * @returns Массив [x, y, z, w].
   */
  public toArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }

  public fromArray( array: ArrayLike<number>, offset: number = 0 ): this {
		this.x = array[ offset ];
		this.y = array[ offset + 1 ];
		this.z = array[ offset + 2 ];
		this.w = array[ offset + 3 ];
		return this;
	}

  public copy(q: Quaternion): this {
    this.x = q.x;
    this.y = q.y;
    this.z = q.z;
    this.w = q.w;
    return this;
  }

  public set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  /**
   * Устанавливает кватернион из оси и угла.
   * @param axis Ось вращения (должна быть нормализована).
   * @param angle Угол вращения в радианах.
   */
  public setFromAxisAngle(axis: Vector3, angle: number): this {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    this.x = axis.x * s;
    this.y = axis.y * s;
    this.z = axis.z * s;
    this.w = Math.cos(halfAngle);
    return this;
  }

  /**
   * Устанавливает кватернион из матрицы вращения.
   * @param m Матрица вращения.
   */
  public setFromRotationMatrix(m: Matrix4): this {
    const te = m.elements,
      m11 = te[0],
      m12 = te[4],
      m13 = te[8],
      m21 = te[1],
      m22 = te[5],
      m23 = te[9],
      m31 = te[2],
      m32 = te[6],
      m33 = te[10],
      trace = m11 + m22 + m33;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      this.w = 0.25 / s;
      this.x = (m32 - m23) * s;
      this.y = (m13 - m31) * s;
      this.z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
      this.w = (m32 - m23) / s;
      this.x = 0.25 * s;
      this.y = (m12 + m21) / s;
      this.z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
      this.w = (m13 - m31) / s;
      this.x = (m12 + m21) / s;
      this.y = 0.25 * s;
      this.z = (m23 + m32) / s;
    } else {
      const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
      this.w = (m21 - m12) / s;
      this.x = (m13 + m31) / s;
      this.y = (m23 + m32) / s;
      this.z = 0.25 * s;
    }
    return this;
  }

  /**
   * Умножает этот кватернион на другой (this = this * q).
   * @param q Кватернион для умножения.
   */
  public multiply(q: Quaternion): this {
    return this.multiplyQuaternions(this, q);
  }

  /**
   * Умножает этот кватернион на другой слева (this = q * this).
   * @param q Кватернион для умножения.
   */
  public premultiply(q: Quaternion): this {
    return this.multiplyQuaternions(q, this);
  }

  /**
   * Устанавливает этот кватернион как результат умножения двух кватернионов (a * b).
   * @param a Левый кватернион.
   * @param b Правый кватернион.
   */
  public multiplyQuaternions(a: Quaternion, b: Quaternion): this {
    const qax = a.x,
      qay = a.y,
      qaz = a.z,
      qaw = a.w;
    const qbx = b.x,
      qby = b.y,
      qbz = b.z,
      qbw = b.w;
    this.x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this.y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this.z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this.w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    return this;
  }

  /**
   * Вычисляет длину кватерниона.
   */
  public length(): number {
    return Math.sqrt(
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    );
  }

  /**
   * Нормализует кватернион.
   */
  public normalize(): this {
    let len = this.length();
    if (len === 0) {
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.w = 1;
    } else {
      len = 1 / len;
      this.x = this.x * len;
      this.y = this.y * len;
      this.z = this.z * len;
      this.w = this.w * len;
    }
    return this;
  }

  /**
   * Сбрасывает кватернион в единичный (без вращения).
   */
  public identity(): this {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;
    return this;
  }
}
