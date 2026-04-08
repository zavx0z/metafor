import { Object3D } from "./Object3D"
import { BufferGeometry } from "./BufferGeometry"
import { Material } from "../materials/Material"
import { Raycaster, Intersection } from "./Raycaster"
import { Matrix4 } from "../math/Matrix4"
import { Ray } from "../math/Ray"
import { Sphere } from "../math/Sphere"
import { Vector3 } from "../math/Vector3"

/**
 * Базовый объект сцены, представляющий 3D-модель.
 *
 * ## Ответственность
 * Связывает математическое описание формы {@link BufferGeometry}
 * с визуальным стилем {@link Material}.
 *
 * ## Особенности рендеринга
 * * Если передан массив материалов, он сопоставляется с `geometry.groups`.
 * * Автоматически обновляет нормали, если они не заданы в геометрии.
 *
 * @example
 * ```ts
 * const geometry = new TorusGeometry();
 * const material = new MeshBasicMaterial({ color: 0xff0000 });
 * const torus = new Mesh(geometry, material);
 * scene.add(torus);
 * ```
 */
export class Mesh extends Object3D {
  /**
   * Структура вершин (позиции, нормали, UV).
   */
  public geometry: BufferGeometry

  /**
   * Визуальное описание поверхности.
   * При использовании массива материалов, индексы соответствуют `geometry.groups[i].materialIndex`.
   */
  public material: Material | Material[]

  /**
   * Инициализирует новый 3D-объект.
   *
   * @param geometry - Экземпляр геометрии. Передается по ссылке (не клонируется).
   * @param material - Одиночный материал или массив.
   * **Важно:** При передаче массива убедитесь, что геометрия разбита на группы.
   */
  constructor(geometry: BufferGeometry, material: Material | Material[]) {
    super()
    this.geometry = geometry
    this.material = material
  }

  public raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    const geometry = this.geometry
    const material = this.material
    const matrixWorld = this.matrixWorld

    if (material === undefined) return

    // 1. Проверка BoundingSphere (быстрый отсев)
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere()

    const sphere = new Sphere().copy(geometry.boundingSphere!).applyMatrix4(matrixWorld)
    if (raycaster.ray.intersectSphere(sphere, new Vector3()) === null) {
      return
    }

    // 2. Трансформируем луч в локальное пространство объекта
    const inverseMatrix = new Matrix4().copy(matrixWorld).invert()
    const localRay = new Ray(raycaster.ray.origin.clone(), raycaster.ray.direction.clone()).applyMatrix4(inverseMatrix)

    // 3. Перебор треугольников (для простоты пока только сферы)
    // TODO: Реализовать точное пересечение с треугольниками
    // Пока что, если прошли сферу, считаем, что попали в объект, но точку берем на сфере
    const intersectionPoint = new Vector3()
    const localIntersection = localRay.intersectSphere(geometry.boundingSphere!, intersectionPoint)

    if (localIntersection) {
        // Переводим точку обратно в мировой сдвиг
        intersectionPoint.applyMatrix4(matrixWorld)
        const distance = raycaster.ray.origin.distanceTo(intersectionPoint)
        
        if (distance < raycaster.near || distance > raycaster.far) return

        intersects.push({
            distance: distance,
            point: intersectionPoint,
            object: this
        })
    }
  }
}
