import { Quaternion } from "./Quaternion"
import { Vector3 } from "./Vector3"

/**
 * Представляет матрицу 4x4 в column-major порядке.
 */
export class Matrix4 {
	public elements: Float32Array

	constructor() {
		this.elements = new Float32Array([
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1,
		])
	}

	/**
	 * Устанавливает значения этой матрицы.
	 */
	public set(
		n11: number, n12: number, n13: number, n14: number,
		n21: number, n22: number, n23: number, n24: number,
		n31: number, n32: number, n33: number, n34: number,
		n41: number, n42: number, n43: number, n44: number,
	): this {
		const te = this.elements
		te[0] = n11; te[4] = n12; te[8] = n13; te[12] = n14
		te[1] = n21; te[5] = n22; te[9] = n23; te[13] = n24
		te[2] = n31; te[6] = n32; te[10] = n33; te[14] = n34
		te[3] = n41; te[7] = n42; te[11] = n43; te[15] = n44
		return this
	}

	/**
	 * Устанавливает матрицу в единичную.
	 */
	public identity(): this {
		return this.set(
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1,
		)
	}

    /**
	 * Транспонирует эту матрицу (меняет строки и столбцы местами).
	 */
	public transpose(): this {
		const te = this.elements
		let tmp

		tmp = te[1]; te[1] = te[4]; te[4] = tmp
		tmp = te[2]; te[2] = te[8]; te[8] = tmp
		tmp = te[6]; te[6] = te[9]; te[9] = tmp
		tmp = te[3]; te[3] = te[12]; te[12] = tmp
		tmp = te[7]; te[7] = te[13]; te[13] = tmp
		tmp = te[11]; te[11] = te[14]; te[14] = tmp

		return this
	}

	/**
	 * Копирует значения из другой матрицы.
	 */
	public copy(m: Matrix4): this {
		this.elements.set(m.elements)
		return this
	}

	/**
	 * Умножает эту матрицу на другую (this = this * m).
	 */
	public multiply(m: Matrix4): this {
		return this.multiplyMatrices(this, m)
	}

	/**
	 * Умножает матрицу `a` на `b` и сохраняет результат в эту матрицу.
	 */
	public multiplyMatrices(a: Matrix4, b: Matrix4): this {
		const ae = a.elements
		const be = b.elements
		const te = this.elements

		const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12]
		const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13]
		const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14]
		const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15]

		const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12]
		const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13]
		const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14]
		const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15]

		te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41
		te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42
		te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43
		te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44

		te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41
		te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42
		te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43
		te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44

		te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41
		te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42
		te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43
		te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44

		te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41
		te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42
		te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43
		te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44

		return this
	}

	/**
	 * Инвертирует матрицу. Использует канонический алгоритм.
	 */
	public invert(): this {
		const te = this.elements
		const n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3]
		const n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7]
		const n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11]
		const n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15]

		const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44
		const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44
		const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44
		const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34

		const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14

		if (det === 0) {
			console.error("Matrix4.invert(): can\\'t invert matrix, determinant is 0")
			return this.identity()
		}

		const detInv = 1 / det

		te[0] = t11 * detInv
		te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv
		te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv
		te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv

		te[4] = t12 * detInv
		te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv
		te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv
		te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv

		te[8] = t13 * detInv
		te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv
		te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv
		te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv

		te[12] = t14 * detInv
		te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv
		te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv
		te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv

		return this
	}

	/**
	 * Создает матрицу вида (view matrix) для правосторонней системы координат.
	 * @param eye Позиция камеры.
	 * @param target Точка, на которую смотрит камера.
	 * @param up Вектор, указывающий "вверх".
	 */
	public makeLookAt(eye: Vector3, target: Vector3, up: Vector3): this {
		const z = new Vector3().subVectors(eye, target).normalize()
		const x = new Vector3().crossVectors(up, z).normalize()
		const y = new Vector3().crossVectors(z, x)

		return this.set(
			x.x, x.y, x.z, -x.dot(eye),
			y.x, y.y, y.z, -y.dot(eye),
			z.x, z.y, z.z, -z.dot(eye),
			0,   0,   0,   1
		)
	}

	/**
	 * Создает матрицу проекции для правосторонней системы координат (RH_ZO, z в [0, 1]).
	 * @param fov Угол обзора в радианах.
	 * @param aspect Соотношение сторон.
	 * @param near Ближняя плоскость отсечения.
	 * @param far Дальняя плоскость отсечения.
	 */
	public makePerspective(fov: number, aspect: number, near: number, far: number): this {
		const te = this.elements
		const f = 1.0 / Math.tan(fov / 2)
		const nf = 1 / (near - far)

		te[0] = f / aspect
		te[1] = 0
		te[2] = 0
		te[3] = 0

		te[4] = 0
		te[5] = f
		te[6] = 0
		te[7] = 0

		te[8] = 0
		te[9] = 0
		te[10] = far * nf
		te[11] = -1

		te[12] = 0
		te[13] = 0
		te[14] = near * far * nf
		te[15] = 0

		return this
	}

	/**
	 * Создает матрицу, представляющую трансформацию из позиции, кватерниона и масштаба.
	 * @param position Вектор позиции.
	 * @param quaternion Кватернион вращения.
	 * @param scale Вектор масштаба.
	 */
	public compose(position: Vector3, quaternion: Quaternion, scale: Vector3): this {
		const te = this.elements

		const x = quaternion.x, y = quaternion.y, z = quaternion.z, w = quaternion.w
		const x2 = x + x, y2 = y + y, z2 = z + z
		const xx = x * x2, xy = x * y2, xz = x * z2
		const yy = y * y2, yz = y * z2, zz = z * z2
		const wx = w * x2, wy = w * y2, wz = w * z2

		const sx = scale.x, sy = scale.y, sz = scale.z

		te[0] = (1 - (yy + zz)) * sx
		te[1] = (xy + wz) * sx
		te[2] = (xz - wy) * sx
		te[3] = 0

		te[4] = (xy - wz) * sy
		te[5] = (1 - (xx + zz)) * sy
		te[6] = (yz + wx) * sy
		te[7] = 0

		te[8] = (xz + wy) * sz
		te[9] = (yz - wx) * sz
		te[10] = (1 - (xx + yy)) * sz
		te[11] = 0

		te[12] = position.x
		te[13] = position.y
		te[14] = position.z
		te[15] = 1

		return this
	}

	/**
	 * Создает матрицу вращения из кватерниона.
	 */
  public makeRotationFromQuaternion(q: Quaternion): this {
    return this.compose(new Vector3(0, 0, 0), q, new Vector3(1, 1, 1))
  }

  public decompose(position: Vector3, quaternion: Quaternion, scale: Vector3): void {
    const te = this.elements

    let sx = new Vector3(te[0], te[1], te[2]).length()
    const sy = new Vector3(te[4], te[5], te[6]).length()
    const sz = new Vector3(te[8], te[9], te[10]).length()

    const det = this.determinant()
    if (det < 0) sx = -sx

    position.x = te[12]
    position.y = te[13]
    position.z = te[14]

    const matrix = new Matrix4().copy(this)

    const invSX = 1 / sx
    const invSY = 1 / sy
    const invSZ = 1 / sz

    matrix.elements[0] *= invSX
    matrix.elements[1] *= invSX
    matrix.elements[2] *= invSX

    matrix.elements[4] *= invSY
    matrix.elements[5] *= invSY
    matrix.elements[6] *= invSY

    matrix.elements[8] *= invSZ
    matrix.elements[9] *= invSZ
    matrix.elements[10] *= invSZ

    quaternion.setFromRotationMatrix(matrix)

    scale.x = sx
    scale.y = sy
    scale.z = sz
  }

  /**
   * Создает матрицу переноса (трансляции).
   * @param x - Сдвиг по оси X.
   * @param y - Сдвиг по оси Y.
   * @param z - Сдвиг по оси Z.
   */
  public makeTranslation(x: number, y: number, z: number): this {
    return this.set(
      1, 0, 0, x,
      0, 1, 0, y,
      0, 0, 1, z,
      0, 0, 0, 1
    )
  }

  /**
   * Масштабирует текущую матрицу (умножает на матрицу масштабирования).
   * @param v - Вектор масштабирования по осям X, Y, Z.
   */
  public scale(v: Vector3): this {
    const te = this.elements
    const x = v.x, y = v.y, z = v.z

    // Умножаем текущую матрицу на матрицу масштабирования
    // Масштабируем каждый столбец матрицы
    te[0] *= x; te[1] *= x; te[2] *= x; te[3] *= x
    te[4] *= y; te[5] *= y; te[6] *= y; te[7] *= y
    te[8] *= z; te[9] *= z; te[10] *= z; te[11] *= z

    return this
  }

  public determinant(): number {
    const te = this.elements
    const n11 = te[0], n12 = te[4], n13 = te[8], n14 = te[12]
    const n21 = te[1], n22 = te[5], n23 = te[9], n24 = te[13]
    const n31 = te[2], n32 = te[6], n33 = te[10], n34 = te[14]
    const n41 = te[3], n42 = te[7], n43 = te[11], n44 = te[15]

    return (
      n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34) +
      n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31) +
      n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31) +
      n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31)
    )
  }

  public getMaxScaleOnAxis(): number {
    const te = this.elements
    const scaleXSq = te[0] * te[0] + te[1] * te[1] + te[2] * te[2]
    const scaleYSq = te[4] * te[4] + te[5] * te[5] + te[6] * te[6]
    const scaleZSq = te[8] * te[8] + te[9] * te[9] + te[10] * te[10]
    return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq))
  }
}