import { Matrix4 } from "../math/Matrix4"
import { Quaternion } from "../math/Quaternion"
import { Vector3 } from "../math/Vector3"

/**
 * Параметры для создания точки обзора.
 */
export interface ViewPointParameters {
  /**
   * HTML-элемент, в котором будет отображаться сцена.
   * Служит для расчёта соотношения сторон и привязки событий ввода.
   */
  element: HTMLElement

  /**
   * Угол обзора (field of view) в радианах.
   * @default 1 (≈57°)
   */
  fov?: number

  /**
   * Ближняя плоскость отсечения. Объекты ближе этой distance не отображаются.
   * @default 0.1
   * @mustBe > 0
   */
  near?: number

  /**
   * Дальняя плоскость отсечения. Объекты дальше этой distance не отображаются.
   * @default 1000
   * @mustBe > near
   */
  far?: number

  /**
   * Начальная позиция камеры.
   * @default { x: 10, y: -10, z: 10 }
   */
  position?: { x: number; y: number; z: number }

  /**
   * Точка, на которую смотрит камера (фокус).
   * @default { x: 0, y: 0, z: 0 }
   */
  target?: { x: number; y: number; z: number }
}

/**
 * # ViewPoint: Единая Точка Обзора
 *
 * Представляет точку обзора (камеру и управление) в 3D-пространстве.
 * Реализует орбитальное управление в стиле Blender (trackball) без блокировки полюсов.
 * Объединяет логику перспективной проекции и обработки пользовательского ввода.
 *
 * ## Философия и Дизайн
 * В отличие от традиционных движков (Camera + Controls), `ViewPoint` — это единая сущность.
 * Конфигурация передается через единый объект-параметр {@link ViewPointParameters}.
 *
 * ## Система координат: RH_ZO
 * Движок использует строгий контракт **RH_ZO**:
 * * **RH (Right-Handed):** Правая система координат (Z-up).
 *   * **+X** — вправо
 *   * **+Y** — вглубь
 *   * **+Z** — вверх
 * * **ZO (Zero-to-One):** Пространство отсечения (Clip Space) имеет глубину **[0, 1]** (стандарт WebGPU).
 *
 * ## Управление "Из Коробки"
 *
 * ### Мышь
 * | Действие | Ввод пользователя | Реализация |
 * | :--- | :--- | :--- |
 * | **Вращение** | ЛКМ + Движение | Trackball-вращение через кватернионы (без Gimbal Lock). |
 * | **Панорамирование** | ПКМ + Движение | Сдвиг вдоль векторов камеры. |
 * | **Панорамирование** | Колесо мыши | Сдвиг по X/Y. |
 * | **Масштаб** | Ctrl + Колесо | Динамический зум, зависящий от расстояния до цели. |
 *
 * ### Тач-устройства (Смартфоны, Планшеты)
 * | Действие | Ввод пользователя |
 * | :--- | :--- |
 * | **Вращение** | Один палец |
 * | **Панорамирование** | Два пальца (перемещение центра) |
 * | **Масштаб** | Два пальца (щипок/pinch) |
 *
 * ### Тачпад (Ноутбук)
 * | Действие | Ввод пользователя |
 * | :--- | :--- |
 * | **Панорамирование** | Свайп двумя пальцами |
 * | **Масштаб** | Жест "щипок" (Pinch-to-Zoom) |
 * | **Вращение** | Движение одним пальцем (с нажатием) |
 */
export class ViewPoint {
  public fov: number
  public aspect: number
  public near: number
  public far: number

  public position: Vector3
  public viewMatrix: Matrix4 = new Matrix4()
  public projectionMatrix: Matrix4 = new Matrix4()

  private element: HTMLElement
  private target: Vector3
  private up: Vector3 = new Vector3(0, 0, 1)

  // Состояние ввода
  private isRotating = false
  private isPanning = false
  private lastX = 0
  private lastY = 0
  private lastTouchDistance: number | null = null

  /**
   * Создает и инициализирует точку обзора.
   *
   * @param parameters - Конфигурация начального состояния.
   * @throws Error Если `fov` или `near` <= 0, или если `far` <= `near`.
   */
  constructor(parameters: ViewPointParameters) {
    this.element = parameters.element
    this.fov = parameters.fov ?? 1 // примерно 57 градусов
    this.near = parameters.near ?? 0.1
    this.far = parameters.far ?? 1000

    if (this.fov <= 0) throw new Error("Угол обзора (fov) должен быть больше нуля.")
    if (this.near <= 0) throw new Error("Ближняя плоскость отсечения (near) должна быть больше нуля.")
    if (this.far <= this.near) throw new Error("Дальняя плоскость отсечения (far) должна быть больше ближней (near).")

    this.aspect = this.element.clientWidth / this.element.clientHeight

    this.target = parameters.target
      ? new Vector3(parameters.target.x, parameters.target.y, parameters.target.z)
      : new Vector3(0, 0, 0)
    this.position = parameters.position
      ? new Vector3(parameters.position.x, parameters.position.y, parameters.position.z)
      : new Vector3(10, -10, 10)

    this.updateProjectionMatrix()
    this.attachEventListeners()
    this.update()
  }

  public setAspectRatio(aspect: number): void {
    if (aspect <= 0) return
    this.aspect = aspect
    this.updateProjectionMatrix()
  }

  public updateProjectionMatrix(): void {
    this.projectionMatrix.makePerspective(this.fov, this.aspect, this.near, this.far)
  }

  /**
   * Обновляет матрицу вида на основе текущего положения, цели и вектора 'up'.
   */
  public update = () => {
    this.viewMatrix.makeLookAt(this.position, this.target, this.up)
  }

  /**
   * Освобождает ресурсы.
   * Удаляет слушатели событий с DOM-элемента и документа.
   */
  public dispose() {
    this.element.removeEventListener("mousedown", this.onMouseDown)
    document.removeEventListener("mousemove", this.onMouseMove)
    document.removeEventListener("mouseup", this.onMouseUp)
    this.element.removeEventListener("wheel", this.onWheel)
    this.element.removeEventListener("contextmenu", this.preventContextMenu)
    this.element.removeEventListener("touchstart", this.onTouchStart)
    this.element.removeEventListener("touchend", this.onTouchEnd)
    this.element.removeEventListener("touchcancel", this.onTouchEnd)
    this.element.removeEventListener("touchmove", this.onTouchMove)
    this.element.removeEventListener("gesturestart", this.onGestureStart)
  }

  private attachEventListeners() {
    this.element.style.touchAction = "none"
    this.element.addEventListener("mousedown", this.onMouseDown)
    document.addEventListener("mousemove", this.onMouseMove)
    document.addEventListener("mouseup", this.onMouseUp)
    this.element.addEventListener("wheel", this.onWheel, { passive: false })
    this.element.addEventListener("contextmenu", this.preventContextMenu)

    this.element.addEventListener("touchstart", this.onTouchStart, { passive: false })
    this.element.addEventListener("touchend", this.onTouchEnd)
    this.element.addEventListener("touchcancel", this.onTouchEnd)
    this.element.addEventListener("touchmove", this.onTouchMove, { passive: false })
    // Предотвращаем стандартное поведение масштабирования страницы на iOS
    this.element.addEventListener("gesturestart", this.onGestureStart, { passive: false })
  }

  private preventContextMenu = (e: Event) => e.preventDefault()

  // Предотвращаем масштабирование всей страницы на iOS при pinch-to-zoom
  private onGestureStart = (event: Event) => event.preventDefault()

  private onMouseDown = (event: MouseEvent) => {
    event.preventDefault()
    if (event.button === 0) this.isRotating = true
    else if (event.button === 2) this.isPanning = true
    this.lastX = event.clientX
    this.lastY = event.clientY
  }

  private onMouseMove = (event: MouseEvent) => {
    if (!this.isRotating && !this.isPanning) return

    const deltaX = event.clientX - this.lastX
    const deltaY = event.clientY - this.lastY

    if (this.isRotating) this.handleRotation(deltaX, deltaY)
    else if (this.isPanning) this.handlePan(deltaX, deltaY)

    this.lastX = event.clientX
    this.lastY = event.clientY
    this.update()
  }

  private onMouseUp = () => {
    this.isRotating = false
    this.isPanning = false
  }

  private onTouchStart = (event: TouchEvent) => {
    event.preventDefault()
    const touches = event.touches

    switch (touches.length) {
      case 1: // Начало вращения
        this.isPanning = false
        this.isRotating = true
        this.lastX = touches[0].clientX
        this.lastY = touches[0].clientY
        break
      case 2: // Начало панорамирования/зума
        this.isRotating = false
        this.isPanning = true
        const dx = touches[0].clientX - touches[1].clientX
        const dy = touches[0].clientY - touches[1].clientY
        this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy)
        this.lastX = (touches[0].clientX + touches[1].clientX) / 2
        this.lastY = (touches[0].clientY + touches[1].clientY) / 2
        break
      default:
        this.isRotating = false
        this.isPanning = false
    }
  }

  private onTouchMove = (event: TouchEvent) => {
    event.preventDefault()
    const touches = event.touches

    if (touches.length === 1 && this.isRotating) {
      const deltaX = touches[0].clientX - this.lastX
      const deltaY = touches[0].clientY - this.lastY
      this.handleRotation(deltaX, deltaY)
      this.lastX = touches[0].clientX
      this.lastY = touches[0].clientY
      this.update()
    } else if (touches.length === 2 && this.isPanning) {
      // Зум
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      const currentTouchDistance = Math.sqrt(dx * dx + dy * dy)
      if (this.lastTouchDistance !== null) {
        const deltaDistance = currentTouchDistance - this.lastTouchDistance
        this.handleZoom(deltaDistance)
      }
      this.lastTouchDistance = currentTouchDistance

      // Панорамирование
      const currentMidX = (touches[0].clientX + touches[1].clientX) / 2
      const currentMidY = (touches[0].clientY + touches[1].clientY) / 2
      const deltaX = currentMidX - this.lastX
      const deltaY = currentMidY - this.lastY
      // Для тачскринов инвертируем панорамирование, чтобы создать эффект "перетаскивания"
      this.handlePan(-deltaX, -deltaY)
      this.lastX = currentMidX
      this.lastY = currentMidY

      this.update()
    }
  }

  private onTouchEnd = (event: TouchEvent) => {
    event.preventDefault()
    const touches = event.touches

    // Все пальцы убраны, сбрасываем состояние
    if (touches.length === 0) {
      this.isRotating = false
      this.isPanning = false
      this.lastTouchDistance = null
      return
    }

    // Переход от панорамирования/зума к вращению (с 2 на 1 палец)
    if (touches.length === 1) {
      this.isPanning = false
      this.lastTouchDistance = null

      // Переключаемся на вращение и обновляем точку отсчета,
      // чтобы предотвратить "прыжок" камеры.
      this.isRotating = true
      this.lastX = touches[0].clientX
      this.lastY = touches[0].clientY
    } else if (touches.length === 2) {
      // Обрабатываем случай, когда было 3+ пальца и осталось 2
      this.isRotating = false
      this.isPanning = true
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy)
      this.lastX = (touches[0].clientX + touches[1].clientX) / 2
      this.lastY = (touches[0].clientY + touches[1].clientY) / 2
    }
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault()
    if (event.ctrlKey) {
      this.handleZoom(-event.deltaY)
    } else {
      this.handlePan(event.deltaX, event.deltaY)
    }
    this.update()
  }

  private handleRotation(deltaX: number, deltaY: number) {
    const rotationSpeed = 0.005
    const offset = new Vector3().subVectors(this.position, this.target)

    // Вращение по горизонтали (вокруг оси Z мира) с коррекцией инверсии
    const horizontalAngle = this.up.z < 0 ? deltaX * rotationSpeed : -deltaX * rotationSpeed
    const quatX = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), horizontalAngle)
    offset.applyQuaternion(quatX)
    this.up.applyQuaternion(quatX)

    // Вращение по вертикали (вокруг оси X камеры)
    const right = new Vector3().crossVectors(this.up, offset).normalize()
    const quatY = new Quaternion().setFromAxisAngle(right, -deltaY * rotationSpeed)
    offset.applyQuaternion(quatY)
    this.up.applyQuaternion(quatY)

    // Обновляем позицию камеры
    this.position.copy(this.target).add(offset)
  }

  private handlePan(deltaX: number, deltaY: number) {
    const offset = new Vector3().subVectors(this.position, this.target)
    const panSpeed = 0.001 * offset.length()

    const te = this.viewMatrix.elements
    // Вектор "вправо" камеры находится в первой строке матрицы вида (в column-major это te[0], te[4], te[8])
    const panRight = new Vector3(te[0], te[4], te[8])
    // Вектор "вверх" камеры находится во второй строке матрицы вида (te[1], te[5], te[9])
    const panUp = new Vector3(te[1], te[5], te[9])

    const panDelta = new Vector3()
      .add(panRight.multiplyScalar(deltaX * panSpeed))
      .add(panUp.multiplyScalar(-deltaY * panSpeed))

    // При панорамировании сдвигаем и позицию, и цель
    this.position.add(panDelta)
    this.target.add(panDelta)
  }

  private handleZoom(delta: number) {
    const offset = new Vector3().subVectors(this.position, this.target)
    const scale = Math.pow(0.95, delta * 0.05)
    const newRadius = Math.max(0.1, offset.length() * scale)

    offset.normalize().multiplyScalar(newRadius)

    this.position.copy(this.target).add(offset)
  }
}
