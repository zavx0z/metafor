import { Matrix4 } from "../math/Matrix4"
import { Quaternion } from "../math/Quaternion"
import { Vector3 } from "../math/Vector3"
import { Raycaster, Intersection } from "./Raycaster"
import type { LayoutProps } from '../layout/LayoutTypes';

/**
 * Базовый класс для всех объектов в сцене.
 * Обеспечивает иерархическую структуру (граф сцены).
 *
 * @remarks
 * Объекты наследуют систему координат **Z-up**:
 * * Позиция `.position` (x, y, z) — где Z это высота.
 * * Вращение `.rotation` / `.quaternion` применяется соответственно.
 */
export class Object3D {
  public name: string = ''
  public parent: Object3D | null = null
  public position: Vector3 = new Vector3()
  public layout?: LayoutProps;
  public quaternion: Quaternion = new Quaternion()

  // Внутреннее свойство для хранения вращения в углах Эйлера.
  private _rotation: Vector3

  constructor() {
    this._rotation = this._createRotationProxy(new Vector3())
  }

  private _createRotationProxy(v: Vector3): Vector3 {
    return new Proxy(v, {
      set: (target, property, value, receiver) => {
        // @ts-ignore
        const success = Reflect.set(target, property, value, receiver)
        if (success && (property === 'x' || property === 'y' || property === 'z')) {
          this.quaternion.setFromEuler(target.x, target.y, target.z)
        }
        return success
      },
    })
  }

  /**
   * Вращение объекта в радианах в виде углов Эйлера {x, y, z}.
   * При изменении этого свойства автоматически обновляется `quaternion`.
   */
  get rotation(): Vector3 {
    return this._rotation
  }

  set rotation(value: Vector3) {
    this._rotation = this._createRotationProxy(value)
    this.quaternion.setFromEuler(value.x, value.y, value.z)
  }

  public scale: Vector3 = new Vector3(1, 1, 1)

  /**
   * Локальная матрица преобразования объекта.
   */
  public modelMatrix: Matrix4 = new Matrix4()
  public matrixWorld: Matrix4 = new Matrix4()

  public children: Object3D[] = []

  /**
   * Видимость объекта. Если false, объект не будет отрисован.
   */
  public visible: boolean = true

  /**
   * Если true, объект проверяется на попадание в пирамиду видимости камеры перед рендерингом.
   * Если false, объект рендерится всегда (если visible=true).
   */
  public frustumCulled: boolean = true

  /**
   * Добавляет дочерний объект в иерархию.
   *
   * @param child - Объект для добавления в качестве дочернего элемента
   */
  public add(child: Object3D): void {
    if (child.parent) {
      child.parent.children = child.parent.children.filter(c => c !== child);
    }
    this.children.push(child)
    child.parent = this
  }

  public getObjectByName(name: string): Object3D | undefined {
    if (this.name === name) return this;
    for (const child of this.children) {
        const object = child.getObjectByName(name);
        if (object !== undefined) {
            return object;
        }
    }
    return undefined;
  }

  public traverse(callback: (object: Object3D) => void) {
    callback(this);
    for (const child of this.children) {
      child.traverse(callback);
    }
  }

  /**
   * Обновляет локальную матрицу преобразования объекта
   * на основе его позиции, кватерниона и масштаба.
   */
  public updateMatrix(): void {
    this.modelMatrix.compose(this.position, this.quaternion, this.scale);
  }

  public lookAt(target: Vector3): void {
    const m = new Matrix4()
    m.makeLookAt(this.position, target, new Vector3(0, 0, 1))
    m.invert()
    this.quaternion.setFromRotationMatrix(m)
  }

  public updateWorldMatrix(force: boolean = false): void {
    this.updateMatrix();
    if (this.parent) {
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.modelMatrix);
    } else {
      this.matrixWorld.copy(this.modelMatrix);
    }
    for (const child of this.children) {
      child.updateWorldMatrix(force);
    }
  }

  public raycast(raycaster: Raycaster, intersects: Intersection[]): void {}

  public findParentByType(type: any): Object3D | null {
    let parent = this.parent;
    while (parent) {
      if (parent instanceof type) return parent;
      parent = parent.parent;
    }
    return null;
  }
}