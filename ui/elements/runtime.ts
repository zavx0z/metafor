/**
 * UiRuntime — единый WebGPU-canvas для UI-поверхностей.
 *
 * Контракт:
 *  • Один Renderer + Space + ViewPoint, perspective camera.
 *  • Поверхности регистрируются как UiSurfaceNode с layout-функцией pixel-rect от
 *    размеров canvas. На resize UiRuntime пересчитывает rect'ы и зовёт
 *    setRect у каждой surface. surface.node.origin = TL surface-rect в world.
 *  • Координаты внутри node — pixel-coords от surface-TL: x,y → ps-units в world.
 *  • Маршрутизация ввода: wheel/key/mouse → surface под курсором.
 *  • Render-on-demand: surface.requestRender → UiRuntime сводит в один RAF.
 */

import {Color, GridHelper, Matrix4, Object3D, Quaternion, Raycaster, Renderer, Space, TrueTypeFont, Vector3, ViewPoint} from "@metafor/engine"
import {HUD} from "./targets/HUD.ts"
import {UIDisplay} from "./targets/UIDisplay.ts"
import {VirtualInput} from "./virtual-input.ts"
import {handleActiveInputKey, insertActiveInputText} from "./input.ts"

export type UiSurfaceRect = {x: number; y: number; w: number; h: number; visible?: boolean}
export type UiSurfaceLayoutFn = (canvas: {w: number; h: number}) => UiSurfaceRect

export interface UiSurfaceNode {
  /** Object3D, который UiRuntime позиционирует. node.origin = TL surface-rect. */
  readonly node: Object3D
  attachCanvas(canvas: UiRuntime): void
  setRect(rect: UiSurfaceRect, pixelScale: number, font: TrueTypeFont): void
  onWheel?(event: WheelEvent, localX: number, localY: number): void
  onKey?(event: KeyboardEvent): void
  /**
   * Текстовый ввод, который пришёл НЕ через keydown: emoji-panel, IME-
   * композиция, dictation, autocorrect-replace. UiRuntime пробрасывает сюда
   * данные из `VirtualInput`. По умолчанию surface может вызывать свой
   * insertText, как при paste.
   */
  onInputText?(text: string): void
  onPointerMove?(event: MouseEvent, localX: number, localY: number): void
  onPointerDown?(event: MouseEvent, localX: number, localY: number): void
  onPointerUp?(event: MouseEvent, localX: number, localY: number): void
  onContextMenu?(event: MouseEvent, localX: number, localY: number): void
  flushPendingRender?(): void
  onPointerLeave?(): void
  onActivate?(): void
  onDeactivate?(): void
  dispose?(): void
}

type SurfaceSlot = {
  surface: UiSurfaceNode
  layout: UiSurfaceLayoutFn
  rect: UiSurfaceRect
}

type ViewPointPose = {
  position: Vector3
  target: Vector3
  up: Vector3
}

export type UiVirtualDisplayMode = "near" | "far"

export type UiVirtualDisplayOpts = {
  /** Начальное состояние дистанции. Default "near" сохраняет текущий плоский вид. */
  initial?: UiVirtualDisplayMode
  /** Центр дисплея в z-up мире. Default: (0, 0, 900). */
  centerMm?: {x: number; y: number; z: number}
  /** Дистанция от камеры до плоскости дисплея в world units/mm. Default cameraDistanceMm. */
  nearDistanceMm?: number
  /** Дальняя дистанция виртуального экрана от камеры. Default nearDistanceMm * 2. */
  farDistanceMm?: number
  /** Длительность плавного подлета/отлета камеры. Default 700ms. */
  flyDurationMs?: number
  /** Показывать z-up grid в XY-плоскости. Default true для virtualDisplay. */
  grid?: boolean
  /** Цвет подложки дисплея. Default — фон UIDisplay. */
  background?: Color | number
}

export type UiRuntimeOpts = {
  /** Путь к TTF-шрифту. По умолчанию '/JetBrainsMono-Bold.ttf'. */
  fontUrl?: string
  /** Camera distance in engine world units. По контракту engine это mm. Default 600. */
  cameraDistanceMm?: number
  /** Field of view. Default π/4. */
  fov?: number
  /**
   * Создать VirtualInput — невидимый textarea, через который идут все
   * keydown'ы и текстовые вставки (emoji, IME, dictation, autocorrect).
   * Нужен, чтобы macOS показывал нативные инструменты ввода для canvas.
   * Default true: canvas UI должен получать нативный текстовый ввод.
   * Если фокус нужен прямо на canvas, передайте false.
   */
  inputProxy?: boolean
  /** Опциональный live UIDisplay, который содержит screen-space surfaces. */
  virtualDisplay?: UiVirtualDisplayOpts
}

const DEFAULT_FONT_URL = "/JetBrainsMono-Bold.ttf"

export class UiRuntime {
  static async create(canvas: HTMLCanvasElement, opts: UiRuntimeOpts = {}): Promise<UiRuntime> {
    const renderer = new Renderer()
    await renderer.init(canvas)
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    const font = await TrueTypeFont.fromUrl(opts.fontUrl ?? DEFAULT_FONT_URL)
    return new UiRuntime(canvas, renderer, font, opts)
  }

  readonly canvas: HTMLCanvasElement
  readonly renderer: Renderer
  readonly space: Space
  readonly hud: HUD
  readonly display: UIDisplay | null
  readonly viewPoint: ViewPoint
  readonly font: TrueTypeFont
  readonly inputProxy: VirtualInput | null
  readonly #surfaces: SurfaceSlot[] = []
  #focused: UiSurfaceNode | null = null
  #pixelWidth = 800
  #pixelHeight = 600
  #pixelScale = 0.001
  #sizeInitialized = false
  readonly #cameraDistanceMm: number
  readonly #displayNearDistanceMm: number
  readonly #displayFarDistanceMm: number
  readonly #displayFlyDurationMs: number
  readonly #displayCenterMm: Vector3
  #displayMode: UiVirtualDisplayMode
  #displayReturnPose: ViewPointPose | null = null
  #displayDistanceMm: number
  #displayNavigationActive = false
  #displayNavigationLastX = 0
  #displayNavigationLastY = 0
  #displayClickCount = 0
  #displayClickTimeMs = 0
  #displayClickX = 0
  #displayClickY = 0
  #cameraAnimationRafId: number | null = null
  #disposed = false
  #renderRequested = false
  #rafId: number | null = null
  #pressedSlot: SurfaceSlot | null = null
  #hoveredSlot: SurfaceSlot | null = null
  readonly #handleWheel = (event: WheelEvent): void => this.#onWheel(event)
  readonly #handleMouseMove = (event: MouseEvent): void => this.#onMouseMove(event)
  readonly #handleMouseDown = (event: MouseEvent): void => this.#onMouseDown(event)
  readonly #handleMouseUp = (event: MouseEvent): void => this.#onMouseUp(event)
  readonly #handleMouseLeave = (): void => this.#onMouseLeave()
  readonly #handleContextMenu = (event: MouseEvent): void => this.#onContextMenu(event)
  readonly #handleKey = (event: KeyboardEvent): void => this.#onKey(event)

  /** Debug alias for callers that inspect the rendered object tree. */
  get scene(): Space {
    return this.space
  }

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer, font: TrueTypeFont, opts: UiRuntimeOpts) {
    this.canvas = canvas
    this.renderer = renderer
    this.font = font
    this.#cameraDistanceMm = opts.cameraDistanceMm ?? 600
    const virtualDisplay = opts.virtualDisplay
    this.#displayNearDistanceMm = Math.max(1, virtualDisplay?.nearDistanceMm ?? this.#cameraDistanceMm)
    this.#displayFarDistanceMm = Math.max(
      this.#displayNearDistanceMm,
      virtualDisplay?.farDistanceMm ?? this.#displayNearDistanceMm * 2,
    )
    this.#displayFlyDurationMs = Math.max(0, virtualDisplay?.flyDurationMs ?? 700)
    this.#displayCenterMm = virtualDisplay?.centerMm === undefined
      ? new Vector3(0, 0, 900)
      : new Vector3(virtualDisplay.centerMm.x, virtualDisplay.centerMm.y, virtualDisplay.centerMm.z)
    this.#displayMode = virtualDisplay?.initial === "far" ? "far" : "near"
    this.#displayDistanceMm = this.#displayMode === "far"
      ? this.#displayFarDistanceMm
      : this.#displayNearDistanceMm
    this.space = new Space()
    this.space.background = new Color(0, 0, 0, 0)
    this.hud = new HUD({distanceMm: this.#cameraDistanceMm})
    if (virtualDisplay !== undefined && virtualDisplay.grid !== false) {
      const grid = new GridHelper(2400, 24, 0x334155, 0x1e293b)
      grid.name = "UiRuntimeGridXY"
      grid.frustumCulled = false
      this.space.add(grid)
    }
    this.display = virtualDisplay === undefined
      ? null
      : new UIDisplay({
        widthMm: 1,
        heightMm: 1,
        pixelWidth: 1,
        pixelHeight: 1,
        ...(virtualDisplay.background === undefined ? {} : {background: virtualDisplay.background}),
      })
    if (this.display !== null) {
      this.display.name = "UiRuntimeDisplay"
      this.display.frustumCulled = false
      this.space.add(this.display)
      this.#applyDisplayTransform()
    }
    this.viewPoint = new ViewPoint({
      element: canvas,
      fov: opts.fov ?? Math.PI / 4,
      near: 1,
      far: 5000,
      position: virtualDisplay === undefined
        ? {x: 0, y: 0, z: this.#cameraDistanceMm}
        : this.#cameraPositionForDisplayDistance(this.#displayDistanceMm),
      target: virtualDisplay === undefined
        ? {x: 0, y: 0, z: 0}
        : this.#displayCenterMm,
    })
    this.viewPoint.alignUpToWorldZ()
    this.viewPoint.update()
    this.viewPoint.dispose() // снимаем orbit-listeners — у нас свои обработчики

    // VirtualInput по умолчанию включён — нужен macOS-инструментам ввода.
    if (opts.inputProxy !== false) {
      const host = canvas.parentElement ?? document.body
      this.inputProxy = new VirtualInput(host)
      this.inputProxy.onKey((e) => this.#onKey(e))
      this.inputProxy.onText((t) => this.#onInputText(t))
    } else {
      this.inputProxy = null
    }

    this.#attachInputListeners()
  }

  /** Регистрирует surface. layout-функция вызывается на каждом resize. */
  addSurface(surface: UiSurfaceNode, layout: UiSurfaceLayoutFn): void {
    surface.attachCanvas(this)
    if (this.display === null) this.space.add(surface.node)
    else this.display.add(surface.node)
    const rect = layout({w: this.#pixelWidth, h: this.#pixelHeight})
    this.#surfaces.push({surface, layout, rect})
    this.#applyLayout()
    this.requestRender()
  }

  /** Регистрирует HUD-surface поверх Space в camera/head-locked слое. */
  addHudSurface(surface: UiSurfaceNode, layout: UiSurfaceLayoutFn): void {
    surface.attachCanvas(this)
    this.hud.add(surface.node)
    const rect = layout({w: this.#pixelWidth, h: this.#pixelHeight})
    this.#surfaces.push({surface, layout, rect})
    this.#applyLayout()
    this.requestRender()
  }

  relayout(): void {
    this.#applyLayout()
    this.requestRender()
  }

  get displayMode(): UiVirtualDisplayMode {
    return this.#displayMode
  }

  setDisplayMode(mode: UiVirtualDisplayMode): void {
    if (this.display === null) return
    const nextDistance = mode === "near" ? this.#displayNearDistanceMm : this.#displayFarDistanceMm
    if (this.#displayMode === mode && Math.abs(nextDistance - this.#currentDisplayDistance()) < 0.001) return
    const previousMode = this.#displayMode
    if (mode === "near" && previousMode === "far") this.#displayReturnPose = this.#captureViewPointPose()
    this.#displayMode = mode
    if (mode === "far") this.setFocused(null)
    if (mode === "far" && this.#displayReturnPose !== null) {
      const pose = this.#displayReturnPose
      this.#displayReturnPose = null
      this.#animateCameraToPose(pose)
      return
    }
    this.#animateCameraToDisplayDistance(nextDistance)
  }

  uiRectToFramebufferClipBounds(xMin: number, yMin: number, xMax: number, yMax: number): [number, number, number, number] {
    if (this.display === null) {
      const dpr = this.renderer.pixelRatio
      return [
        Math.min(xMin, xMax) * dpr,
        Math.min(yMin, yMax) * dpr,
        Math.max(xMin, xMax) * dpr,
        Math.max(yMin, yMax) * dpr,
      ]
    }

    const p0 = this.#projectDisplayUiPoint(xMin, yMin)
    const p1 = this.#projectDisplayUiPoint(xMax, yMin)
    const p2 = this.#projectDisplayUiPoint(xMax, yMax)
    const p3 = this.#projectDisplayUiPoint(xMin, yMax)
    const xs = [p0.x, p1.x, p2.x, p3.x]
    const ys = [p0.y, p1.y, p2.y, p3.y]
    return [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ]
  }

  #projectDisplayUiPoint(x: number, y: number): {x: number; y: number} {
    const dpr = this.renderer.pixelRatio
    if (this.display === null) return {x: x * dpr, y: y * dpr}
    const worldPoint = new Vector3(
      (x - this.#pixelWidth / 2) * this.#pixelScale,
      (this.#pixelHeight / 2 - y) * this.#pixelScale,
      0,
    ).applyMatrix4(this.display.matrixWorld)
    const viewProjection = new Matrix4().multiplyMatrices(this.viewPoint.projectionMatrix, this.viewPoint.viewMatrix)
    const ndc = worldPoint.applyMatrix4(viewProjection)
    return {
      x: (ndc.x * 0.5 + 0.5) * this.#pixelWidth * dpr,
      y: (0.5 - ndc.y * 0.5) * this.#pixelHeight * dpr,
    }
  }

  #currentDisplayDistance(): number {
    if (this.display === null) return this.#displayDistanceMm
    return this.viewPoint.position.distanceTo(this.#displayCenterWorld())
  }

  #displayCenterWorld(): Vector3 {
    if (this.display === null) return new Vector3()
    this.space.updateWorldMatrix()
    const e = this.display.matrixWorld.elements
    return new Vector3(e[12]!, e[13]!, e[14]!)
  }

  #cameraPositionForDisplayDistance(distanceMm: number): {x: number; y: number; z: number} {
    return {
      x: this.#displayCenterMm.x,
      y: this.#displayCenterMm.y - distanceMm,
      z: this.#displayCenterMm.z,
    }
  }

  #captureViewPointPose(): ViewPointPose {
    return {
      position: this.viewPoint.position.clone(),
      target: this.viewPoint.getTarget().clone(),
      up: this.viewPoint.getUp().clone(),
    }
  }

  #animateCameraToDisplayDistance(distanceMm: number): void {
    if (this.display === null) return
    const target = this.#displayCenterWorld()
    this.#animateCameraToPose({
      position: target.clone().add(new Vector3(0, -distanceMm, 0)),
      target,
      up: new Vector3(0, 0, 1),
    }, distanceMm)
  }

  #animateCameraToPose(endPose: ViewPointPose, finalDistanceMm?: number): void {
    this.#cancelCameraAnimation()

    const startPosition = this.viewPoint.position.clone()
    const startTarget = this.viewPoint.getTarget().clone()
    const startUp = this.viewPoint.getUp().clone()
    const startOffset = new Vector3().subVectors(startPosition, startTarget)
    if (startOffset.length() < 0.001) startOffset.set(0, -this.#displayFarDistanceMm, 0)
    const endOffset = new Vector3().subVectors(endPose.position, endPose.target)
    const startedAt = performance.now()
    const duration = this.#displayFlyDurationMs

    const step = (now: number): void => {
      if (this.#disposed) return
      const t = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration)
      const eased = easeInOutCubic(t)
      const target = new Vector3(
        lerp(startTarget.x, endPose.target.x, eased),
        lerp(startTarget.y, endPose.target.y, eased),
        lerp(startTarget.z, endPose.target.z, eased),
      )
      this.viewPoint.position.copy(target).add(slerpOffset(startOffset, endOffset, eased))
      this.viewPoint.getTarget().copy(target)
      this.viewPoint.getUp().copy(slerpOffset(startUp, endPose.up, eased).normalize())
      this.viewPoint.update()
      this.#displayDistanceMm = this.viewPoint.position.distanceTo(target)
      this.#applyLayout()
      this.requestRender()
      if (t < 1) {
        this.#cameraAnimationRafId = requestAnimationFrame(step)
      } else {
        this.#cameraAnimationRafId = null
        this.viewPoint.position.copy(endPose.position)
        this.viewPoint.getTarget().copy(endPose.target)
        this.viewPoint.getUp().copy(endPose.up)
        this.viewPoint.update()
        this.#displayDistanceMm = finalDistanceMm ?? this.viewPoint.position.distanceTo(endPose.target)
        this.#applyLayout()
        this.requestRender()
      }
    }

    this.#cameraAnimationRafId = requestAnimationFrame(step)
  }

  #cancelCameraAnimation(): void {
    if (this.#cameraAnimationRafId === null) return
    cancelAnimationFrame(this.#cameraAnimationRafId)
    this.#cameraAnimationRafId = null
  }

  #toggleDisplayFlight(): void {
    this.setDisplayMode(this.displayMode === "near" ? "far" : "near")
  }

  #orbitDisplay(deltaX: number, deltaY: number): void {
    if (this.display === null) return
    this.#cancelCameraAnimation()
    const target = this.#displayCenterWorld()
    this.viewPoint.getTarget().copy(target)
    const offset = new Vector3().subVectors(this.viewPoint.position, target)
    if (offset.length() < 0.001) offset.set(0, -this.#displayFarDistanceMm, 0)
    const up = this.viewPoint.getUp()
    const rotationSpeed = 0.005
    const horizontalAngle = up.z < 0 ? deltaX * rotationSpeed : -deltaX * rotationSpeed
    const quatX = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), horizontalAngle)
    offset.applyQuaternion(quatX)
    up.applyQuaternion(quatX)
    const right = new Vector3().crossVectors(up, offset).normalize()
    const quatY = new Quaternion().setFromAxisAngle(right, -deltaY * rotationSpeed)
    offset.applyQuaternion(quatY)
    up.applyQuaternion(quatY)

    this.viewPoint.position.copy(target).add(offset)
    this.viewPoint.update()
    this.#displayDistanceMm = offset.length()
    this.#applyLayout()
    this.requestRender()
  }

  #zoomDisplay(delta: number): void {
    if (this.display === null) return
    this.#cancelCameraAnimation()
    const target = this.#displayCenterWorld()
    this.viewPoint.getTarget().copy(target)
    const offset = new Vector3().subVectors(this.viewPoint.position, target)
    const currentRadius = Math.max(0.001, offset.length())
    const scale = Math.pow(0.95, delta * 0.05)
    const scaledRadius = currentRadius * scale
    const scaledDelta = currentRadius - scaledRadius
    const minZoomDistance = Math.max(1, this.viewPoint.near * 2)
    const minimumRadiusDelta = Math.max(0.01, this.viewPoint.near * 0.2 * Math.abs(delta) * 0.01)
    const radiusDelta = Math.sign(scaledDelta) * Math.max(Math.abs(scaledDelta), minimumRadiusDelta)
    const nextRadius = Math.max(minZoomDistance, currentRadius - radiusDelta)
    offset.normalize().multiplyScalar(nextRadius)
    this.viewPoint.position.copy(target).add(offset)
    this.viewPoint.update()
    this.#displayDistanceMm = nextRadius
    this.#applyLayout()
    this.requestRender()
  }

  #displayRayHit(canvasX: number, canvasY: number): Vector3 | null {
    if (this.display === null) return null
    this.viewPoint.update()
    this.space.updateWorldMatrix()
    const raycaster = new Raycaster()
    raycaster.setFromCamera({
      x: (canvasX / this.#pixelWidth) * 2 - 1,
      y: 1 - (canvasY / this.#pixelHeight) * 2,
    }, this.viewPoint)
    const inverseDisplay = new Matrix4().copy(this.display.matrixWorld).invert()
    const localOrigin = raycaster.ray.origin.clone().applyMatrix4(inverseDisplay)
    const localEnd = raycaster.ray.origin.clone().add(raycaster.ray.direction).applyMatrix4(inverseDisplay)
    const localDirection = localEnd.sub(localOrigin).normalize()
    if (Math.abs(localDirection.z) < 0.000001) return null
    const distance = -localOrigin.z / localDirection.z
    if (distance < 0) return null
    return localOrigin.clone().add(localDirection.multiplyScalar(distance))
  }

  #isDisplayTripleClick(event: MouseEvent): boolean {
    if (this.display === null || event.button !== 0) return false
    if (event.detail >= 3) {
      this.#resetDisplayClickCount()
      return true
    }
    return this.#recordDisplayClick(event)
  }

  #recordDisplayClick(event: MouseEvent): boolean {
    const now = performance.now()
    const dx = event.clientX - this.#displayClickX
    const dy = event.clientY - this.#displayClickY
    const sameClickCluster = now - this.#displayClickTimeMs < 550 && Math.hypot(dx, dy) < 8
    this.#displayClickCount = sameClickCluster ? this.#displayClickCount + 1 : 1
    this.#displayClickTimeMs = now
    this.#displayClickX = event.clientX
    this.#displayClickY = event.clientY
    if (this.#displayClickCount < 3) return false
    this.#resetDisplayClickCount()
    return true
  }

  #resetDisplayClickCount(): void {
    this.#displayClickCount = 0
    this.#displayClickTimeMs = 0
  }

  #beginDisplayNavigation(event: MouseEvent): void {
    this.#cancelCameraAnimation()
    this.#displayNavigationActive = true
    this.#displayNavigationLastX = event.clientX
    this.#displayNavigationLastY = event.clientY
    this.canvas.style.cursor = "grabbing"
  }

  #endDisplayNavigation(): void {
    if (!this.#displayNavigationActive) return
    this.#displayNavigationActive = false
    this.canvas.style.cursor = this.displayMode === "far" ? "grab" : "default"
  }

  #isDisplayNavigationMode(): boolean {
    return this.display !== null && this.displayMode === "far"
  }

  handleResize(): void {
    if (this.#disposed) return
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (w < 2 || h < 2) return
    if (this.#sizeInitialized && w === this.#pixelWidth && h === this.#pixelHeight) return
    this.#sizeInitialized = true

    this.renderer.setSize(w, h)
    this.viewPoint.setAspectRatio(w / h)
    this.#pixelWidth = w
    this.#pixelHeight = h
    const layoutDistance = this.display === null ? this.#cameraDistanceMm : this.#displayNearDistanceMm
    const physicalHeight = 2 * layoutDistance * Math.tan(this.viewPoint.fov / 2)
    this.#pixelScale = physicalHeight / this.#pixelHeight
    this.#applyLayout()
    this.requestRender()
  }

  requestRender(): void {
    if (this.#renderRequested || this.#disposed) return
    this.#renderRequested = true
    this.#rafId = requestAnimationFrame(() => {
      this.#rafId = null
      this.#renderRequested = false
      for (const slot of this.#surfaces) slot.surface.flushPendingRender?.()
      this.space.updateWorldMatrix()
      this.renderer.renderFrame(this.space, this.hud, this.viewPoint)
    })
  }

  setFocused(surface: UiSurfaceNode | null): void {
    if (this.#focused === surface) return
    this.#focused?.onDeactivate?.()
    this.#focused = surface
    surface?.onActivate?.()
    this.requestRender()
  }

  dispose(): void {
    this.#disposed = true
    if (this.#rafId !== null) cancelAnimationFrame(this.#rafId)
    this.#cancelCameraAnimation()
    this.canvas.removeEventListener("wheel", this.#handleWheel)
    this.canvas.removeEventListener("mousemove", this.#handleMouseMove)
    this.canvas.removeEventListener("mousedown", this.#handleMouseDown)
    this.canvas.removeEventListener("keydown", this.#handleKey)
    this.canvas.removeEventListener("mouseleave", this.#handleMouseLeave)
    this.canvas.removeEventListener("contextmenu", this.#handleContextMenu)
    window.removeEventListener("mouseup", this.#handleMouseUp)
    this.setFocused(null)
    this.#pressedSlot = null
    this.#hoveredSlot = null
    this.#displayNavigationActive = false
    this.inputProxy?.dispose()
    for (const slot of this.#surfaces) slot.surface.dispose?.()
    this.#surfaces.length = 0
  }

  // ────────────────────────── Internal layout ──────────────────────────

  #applyLayout(): void {
    this.#applyDisplayGeometry()
    this.space.updateWorldMatrix()
    for (const slot of this.#surfaces) {
      slot.rect = slot.layout({w: this.#pixelWidth, h: this.#pixelHeight})
      const visible = slot.rect.visible !== false && slot.rect.w > 0 && slot.rect.h > 0
      slot.surface.node.visible = visible
      if (!visible) continue
      slot.surface.node.position.x = (slot.rect.x - this.#pixelWidth / 2) * this.#pixelScale
      slot.surface.node.position.y = (this.#pixelHeight / 2 - slot.rect.y) * this.#pixelScale
      slot.surface.node.updateMatrix()
      slot.surface.setRect(slot.rect, this.#pixelScale, this.font)
    }
  }

  #applyDisplayGeometry(): void {
    if (this.display === null) return
    this.display.resize({
      widthMm: this.#pixelWidth * this.#pixelScale,
      heightMm: this.#pixelHeight * this.#pixelScale,
      pixelWidth: this.#pixelWidth,
      pixelHeight: this.#pixelHeight,
    }, {
      invalidateGeometry: (geometry) => this.renderer.invalidateGeometry(geometry),
    })
    this.#applyDisplayTransform()
  }

  #applyDisplayTransform(): void {
    if (this.display === null) return
    this.display.position.copy(this.#displayCenterMm)
    this.display.rotation.x = Math.PI / 2
    this.display.updateMatrix()
  }

  // ────────────────────────── Input routing ──────────────────────────

  #attachInputListeners(): void {
    this.canvas.addEventListener("wheel", this.#handleWheel, {passive: false})
    this.canvas.addEventListener("mousemove", this.#handleMouseMove)
    this.canvas.addEventListener("mousedown", this.#handleMouseDown)
    this.canvas.addEventListener("contextmenu", this.#handleContextMenu)
    this.canvas.addEventListener("keydown", this.#handleKey)
    // mouseup на window — релиз за пределами canvas сбрасывает pressed.
    window.addEventListener("mouseup", this.#handleMouseUp)
    this.canvas.addEventListener("mouseleave", this.#handleMouseLeave)
    // Когда есть VirtualInput, canvas НЕ должен быть focusable: иначе click
    // переведёт фокус на canvas и отнимет его у textarea (а вместе с ним —
    // emoji-panel и IME). Без tabIndex Chrome не двигает фокус по клику.
    if (this.inputProxy === null) {
      if (this.canvas.tabIndex < 0) this.canvas.tabIndex = 0
    } else {
      this.canvas.tabIndex = -1
    }
  }

  #surfaceAt(localX: number, localY: number): SurfaceSlot | undefined {
    // Reverse iteration — последняя добавленная surface перекрывает предыдущие.
    for (let i = this.#surfaces.length - 1; i >= 0; i--) {
      const slot = this.#surfaces[i]!
      const r = slot.rect
      if (slot.surface.node.visible === false || r.visible === false || r.w <= 0 || r.h <= 0) continue
      if (localX >= r.x && localX <= r.x + r.w && localY >= r.y && localY <= r.y + r.h) return slot
    }
    return undefined
  }

  #localCoords(event: MouseEvent | WheelEvent): {x: number; y: number} {
    const rect = this.canvas.getBoundingClientRect()
    return {x: event.clientX - rect.left, y: event.clientY - rect.top}
  }

  #displayCoords(canvasX: number, canvasY: number, requireInside = true): {x: number; y: number} | null {
    if (this.display === null) return {x: canvasX, y: canvasY}
    const hit = this.#displayRayHit(canvasX, canvasY)
    if (hit === null) return null
    const x = hit.x / this.#pixelScale + this.#pixelWidth / 2
    const y = this.#pixelHeight / 2 - hit.y / this.#pixelScale
    if (
      requireInside &&
      (x < 0 || y < 0 || x > this.#pixelWidth || y > this.#pixelHeight)
    ) {
      return null
    }
    return {x, y}
  }

  #onWheel(event: WheelEvent): void {
    if (this.#isDisplayNavigationMode()) {
      event.preventDefault()
      this.#zoomDisplay(-event.deltaY)
      return
    }
    const canvasCoords = this.#localCoords(event)
    const displayCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y)
    if (displayCoords === null) return
    const slot = this.#surfaceAt(displayCoords.x, displayCoords.y)
    if (slot === undefined) return
    event.preventDefault()
    slot.surface.onWheel?.(event, displayCoords.x - slot.rect.x, displayCoords.y - slot.rect.y)
  }

  #onMouseMove(event: MouseEvent): void {
    if (this.#displayNavigationActive) {
      event.preventDefault()
      const deltaX = event.clientX - this.#displayNavigationLastX
      const deltaY = event.clientY - this.#displayNavigationLastY
      this.#displayNavigationLastX = event.clientX
      this.#displayNavigationLastY = event.clientY
      this.#orbitDisplay(deltaX, deltaY)
      return
    }

    const canvasCoords = this.#localCoords(event)
    const displayCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y)
    if (displayCoords === null) {
      this.canvas.style.cursor = "default"
      this.#hoveredSlot?.surface.onPointerLeave?.()
      this.#hoveredSlot = null
      return
    }
    if (this.#isDisplayNavigationMode()) {
      this.canvas.style.cursor = "grab"
      this.#hoveredSlot?.surface.onPointerLeave?.()
      this.#hoveredSlot = null
      return
    }
    const slot = this.#surfaceAt(displayCoords.x, displayCoords.y)
    if (this.#pressedSlot !== null && this.#pressedSlot !== undefined) {
      const dragCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y, false) ?? displayCoords
      this.#pressedSlot.surface.onPointerMove?.(event, dragCoords.x - this.#pressedSlot.rect.x, dragCoords.y - this.#pressedSlot.rect.y)
      return
    }
    if (slot !== this.#hoveredSlot) {
      this.#hoveredSlot?.surface.onPointerLeave?.()
      this.#hoveredSlot = slot ?? null
    }
    if (slot === undefined) {
      this.canvas.style.cursor = "default"
      return
    }
    // Focus НЕ меняем по hover — иначе текстовый редактор теряет keydown
    // как только мышь уезжает на DOM-iframe или в зазор между surfaces.
    // Активная surface переключается ТОЛЬКО mousedown'ом.
    slot.surface.onPointerMove?.(event, displayCoords.x - slot.rect.x, displayCoords.y - slot.rect.y)
  }

  #onMouseDown(event: MouseEvent): void {
    if (this.#isDisplayTripleClick(event)) {
      event.preventDefault()
      this.#endDisplayNavigation()
      this.#toggleDisplayFlight()
      return
    }
    if (this.#isDisplayNavigationMode() && event.button === 0) {
      event.preventDefault()
      this.#hoveredSlot?.surface.onPointerLeave?.()
      this.#hoveredSlot = null
      this.#beginDisplayNavigation(event)
      return
    }

    const canvasCoords = this.#localCoords(event)
    const displayCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y)
    if (displayCoords === null) return
    const slot = this.#surfaceAt(displayCoords.x, displayCoords.y)
    if (slot !== undefined) {
      // Не даём браузеру передвинуть фокус по умолчанию: VirtualInput
      // должен остаться сфокусированным, чтобы macOS показывал ему
      // инструменты ввода.
      if (this.inputProxy !== null) {
        event.preventDefault()
        this.inputProxy.focus()
      } else {
        this.canvas.focus()
      }
      // Позиционируем 1×1 textarea около курсора, чтобы всплывающие окна
      // macOS появлялись рядом, а не в углу страницы.
      this.#positionInputProxy(event.clientX, event.clientY)
      this.setFocused(slot.surface)
      this.#pressedSlot = slot
      slot.surface.onPointerDown?.(event, displayCoords.x - slot.rect.x, displayCoords.y - slot.rect.y)
    }
  }

  #onContextMenu(event: MouseEvent): void {
    const canvasCoords = this.#localCoords(event)
    const displayCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y)
    event.preventDefault()
    if (displayCoords === null || this.#isDisplayNavigationMode()) return
    const slot = this.#surfaceAt(displayCoords.x, displayCoords.y)
    if (slot === undefined) return
    slot.surface.onContextMenu?.(event, displayCoords.x - slot.rect.x, displayCoords.y - slot.rect.y)
  }

  #positionInputProxy(clientX: number, clientY: number): void {
    if (this.inputProxy === null) return
    this.inputProxy.setCaretViewport(clientX, clientY)
  }

  #onMouseUp(event: MouseEvent): void {
    if (this.#displayNavigationActive) {
      this.#endDisplayNavigation()
      return
    }
    const slot = this.#pressedSlot
    this.#pressedSlot = null
    if (slot === undefined || slot === null) return
    const canvasCoords = this.#localCoords(event)
    const displayCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y, false)
    if (displayCoords === null) return
    slot.surface.onPointerUp?.(event, displayCoords.x - slot.rect.x, displayCoords.y - slot.rect.y)
  }

  #onMouseLeave(): void {
    // Не сбрасываем focus — пользователь может уйти мышью на toolbar/iframe
    // и продолжать набирать. Focus снимается только новым mousedown.
    this.canvas.style.cursor = "default"
    this.#hoveredSlot?.surface.onPointerLeave?.()
    this.#hoveredSlot = null
  }

  #onKey(event: KeyboardEvent): void {
    const focused = this.#focused
    if (focused === null) return
    focused.onKey?.(event)
    if (!event.defaultPrevented) handleActiveInputKey(focused as UiSurfaceForInput, event)
  }

  #onInputText(text: string): void {
    const focused = this.#focused
    if (focused === null) return
    focused.onInputText?.(text)
    insertActiveInputText(focused as UiSurfaceForInput, text)
  }
}

type UiSurfaceForInput = Parameters<typeof handleActiveInputKey>[0]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function slerpOffset(start: Vector3, end: Vector3, t: number): Vector3 {
  const startRadius = Math.max(0.001, start.length())
  const endRadius = Math.max(0.001, end.length())
  const radius = lerp(startRadius, endRadius, t)
  const from = start.clone().normalize()
  const to = end.clone().normalize()
  const dot = Math.max(-1, Math.min(1, from.dot(to)))

  if (dot > 0.9995) {
    return new Vector3(
      lerp(from.x, to.x, t),
      lerp(from.y, to.y, t),
      lerp(from.z, to.z, t),
    ).normalize().multiplyScalar(radius)
  }

  if (dot < -0.9995) {
    const axis = new Vector3().crossVectors(from, new Vector3(0, 0, 1))
    if (axis.length() < 0.001) axis.crossVectors(from, new Vector3(1, 0, 0))
    return from
      .applyQuaternion(new Quaternion().setFromAxisAngle(axis.normalize(), Math.PI * t))
      .multiplyScalar(radius)
  }

  const theta = Math.acos(dot)
  const sinTheta = Math.sin(theta)
  const fromScale = Math.sin((1 - t) * theta) / sinTheta
  const toScale = Math.sin(t * theta) / sinTheta
  return new Vector3(
    from.x * fromScale + to.x * toScale,
    from.y * fromScale + to.y * toScale,
    from.z * fromScale + to.z * toScale,
  ).normalize().multiplyScalar(radius)
}
