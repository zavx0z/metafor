import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from "@metafor/engine"

export interface UIDisplayParameters {
  widthMm: number // Ширина виртуального дисплея в world units; по контракту engine это mm
  heightMm: number // Высота виртуального дисплея в world units; по контракту engine это mm
  pixelWidth: number // Ширина логической пиксельной сетки виртуального UI
  pixelHeight: number // Высота логической пиксельной сетки виртуального UI
  background?: Color | number // Цвет фона виртуального дисплея
}

/**
 * Виртуальный дисплей для UI внутри WebGPU-сцены.
 *
 * `widthMm` и `heightMm` задают размер дисплея в world units.
 * По контракту engine world unit = mm.
 *
 * `pixelWidth` и `pixelHeight` задают логическую пиксельную сетку UI.
 * Это не разрешение физического монитора пользователя.
 *
 * `unitsPerPixel` связывает виртуальную пиксельную сетку с размером дисплея в мире.
 *
 * `pixelDensity` — производная виртуальная плотность дисплея в px/inch.
 * Это не DPI/PPI физического устройства пользователя.
 *
 * Сам по себе `UIDisplay` не является HUD.
 * HUD — отдельный camera/head-locked слой, который может использовать `UIDisplay` как содержимое.
 */
export class UIDisplay extends Object3D {
  public readonly isUIDisplay: true = true
  public widthMm: number
  public heightMm: number
  public pixelWidth: number
  public pixelHeight: number
  public contentContainer: Object3D

  constructor(params: UIDisplayParameters) {
    super()
    this.widthMm = params.widthMm
    this.heightMm = params.heightMm
    this.pixelWidth = params.pixelWidth
    this.pixelHeight = params.pixelHeight

    // 1. Создаем подложку виртуального дисплея
    const bgGeometry = new PlaneGeometry({
      width: this.widthMm,
      height: this.heightMm,
    })
    const bgMaterial = new MeshBasicMaterial({
      color: params.background ?? 0x111111,
    })
    const backgroundMesh = new Mesh(bgGeometry, bgMaterial)

    this.add(backgroundMesh)

    // 2. Контейнер для контента (Flexbox root)
    this.contentContainer = new Object3D()

    // Корневой layout задается в виртуальных UI-пикселях.
    this.contentContainer.layout = {
      width: this.pixelWidth,
      height: this.pixelHeight,
      flexDirection: "column",
      justifyContent: "flex-start",
      alignItems: "center",
      padding: 20,
    }

    // Смещаем контент так, чтобы (0,0) layout-сетки совпадал с верхним левым углом дисплея.
    this.contentContainer.position.set(
      -this.widthMm / 2,
      this.heightMm / 2,
      0.5,
    )
    this.contentContainer.updateMatrix()

    this.add(this.contentContainer)
    this.createBorder()
  }

  private createBorder(): void {
    const w = this.widthMm / 2
    const h = this.heightMm / 2
    const vertices = new Float32Array([
      -w, h, 0, w, h, 0,
      w, h, 0, w, -h, 0,
      w, -h, 0, -w, -h, 0,
      -w, -h, 0, -w, h, 0,
    ])
    const borderGeo = new BufferGeometry()
    borderGeo.setAttribute("position", new BufferAttribute(vertices, 3))
    const borderMat = new LineBasicMaterial({ color: 0x748297 })
    const border = new LineSegments(borderGeo, borderMat)
    border.position.z = 0.1
    this.add(border)
  }

  /**
   * Добавляет элемент UI на экран.
   * @param child Объект (Text, Mesh и т.д.)
   */
  public addUI(child: Object3D): void {
    this.contentContainer.add(child)
  }

  /**
   * Переводит размер шрифта из виртуальных UI-пикселей в world units.
   * По контракту engine world unit = mm.
   */
  public getFontSize(pixels: number): number {
    return pixels * this.unitsPerPixel
  }

  /**
   * Сколько world units занимает один виртуальный UI-пиксель по горизонтали.
   */
  public get unitsPerPixel(): number {
    return this.widthMm / this.pixelWidth
  }

  /**
   * Сколько world units занимает один виртуальный UI-пиксель по вертикали.
   */
  public get verticalUnitsPerPixel(): number {
    return this.heightMm / this.pixelHeight
  }

  /**
   * Это виртуальная плотность дисплея в pixels per inch.
   * Это не DPI/PPI физического монитора пользователя.
   * Значение вычисляется из размера виртуального дисплея в world units
   * и его логической пиксельной сетки.
   */
  public get pixelDensity(): number {
    return this.pixelWidth / (this.widthMm / 25.4)
  }
}
