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
import {VirtualInput, type VirtualInputSoftKeyboardMode} from "./virtual-input.ts"
import {handleActiveInputKey, insertActiveInputText, surfaceHasActiveInput} from "./input.ts"

export type UiSurfaceRect = {x: number; y: number; w: number; h: number; visible?: boolean}
export type UiSurfaceLayoutFn = (canvas: {w: number; h: number}) => UiSurfaceRect
export type UiSurfaceLayerOpts = {
  /** Local order inside a window. Without windowId this is the legacy global surface layer. */
  zIndex?: number
  /** OS-style window identity. Surfaces with the same id move together in window order. */
  windowId?: string
  /** Coarse outer layer for the whole window: ordinary windows, docks, overlays. */
  windowZIndex?: number
}
export type UiRuntimeRelayoutScope = "space" | "hud" | "all"
export type UiRuntimeRelayoutOpts = {
  scope?: UiRuntimeRelayoutScope
  forceSetRect?: boolean
}
export type UiDisplayId = string
export type UiRuntimeDisplayOpts = {
  id: UiDisplayId
  widthMm: number
  heightMm: number
  pixelWidth: number
  pixelHeight: number
  centerMm: {x: number; y: number; z: number}
  background?: Color | number
  border?: Color | number | null
}
export type UiDisplayHoverOutline = {
  topLeft: {x: number; y: number}
  topRight: {x: number; y: number}
  bottomRight: {x: number; y: number}
  bottomLeft: {x: number; y: number}
}

export type UiRuntimeDisplaySnapshot = {
  id: UiDisplayId
  active: boolean
  hovered: boolean
  visible: boolean
  centerMm: {x: number; y: number; z: number}
  metrics: {widthMm: number; heightMm: number; pixelWidth: number; pixelHeight: number}
  screenCenter: {x: number; y: number} | null
  screenRect: {x: number; y: number; w: number; h: number} | null
  outline: UiDisplayHoverOutline | null
}

export interface UiSurfaceNode {
  /** Object3D, который UiRuntime позиционирует. node.origin = TL surface-rect. */
  readonly node: Object3D
  attachCanvas(canvas: UiRuntime): void
  setRect(rect: UiSurfaceRect, pixelScale: number, font: TrueTypeFont): void
  moveRect?(rect: UiSurfaceRect, pixelScale: number, font: TrueTypeFont): void
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
  requestRender?(): void
  acceptsPointerEvents?(): boolean
  containsPointer?(localX: number, localY: number): boolean
  preserveNativeTouchActivation?(): boolean
  softKeyboardInputMode?(): VirtualInputSoftKeyboardMode
  setFramebufferClipSpace?(space: "display" | "screen"): void
  setFramebufferDisplayId?(displayId: UiDisplayId): void
  onPointerLeave?(): void
  setActive?(active: boolean): void
  onActivate?(): void
  onDeactivate?(): void
  dispose?(): void
}

type SurfaceSlot = {
  surface: UiSurfaceNode
  layout: UiSurfaceLayoutFn
  rect: UiSurfaceRect
  rectOverride?: UiSurfaceRect
  pixelScale?: number
  target: "display" | "hud"
  displayId?: UiDisplayId
  order: number
  windowZIndex: number
  zIndex: number
  windowId: string | null
  windowOrder: number
}

type DisplaySlot = {
  id: UiDisplayId
  display: UIDisplay
  centerMm: Vector3
  pixelWidth: number
  pixelHeight: number
  pixelScale: number
  geometryInitialized: boolean
  explicitWidthMm?: number
  explicitHeightMm?: number
  explicitPixelWidth?: number
  explicitPixelHeight?: number
}

type DisplayRayHit = {
  displayId: UiDisplayId
  display: UIDisplay
  point: Vector3
  distance: number
}

type DisplayCoords = {
  displayId: UiDisplayId
  x: number
  y: number
}

type ViewPointPose = {
  position: Vector3
  target: Vector3
  up: Vector3
}

type DisplayDragCandidate = {
  displayId: UiDisplayId
  timer: number
  startClientX: number
  startClientY: number
  clientX: number
  clientY: number
}

type DisplayDragActive = {
  displayId: UiDisplayId
  planeY: number
  offset: Vector3
}

type DisplayTouchGesture = {
  displayId: UiDisplayId | null
  startClientX: number
  startClientY: number
  timer: number | null
  longPressFired: boolean
}

export type UiVirtualDisplayMode = "near" | "far"

export type UiRuntimeViewPointVector = {x: number; y: number; z: number}

export type UiRuntimeViewPointSnapshot = {
  displayMode: UiVirtualDisplayMode
  activeDisplayId: UiDisplayId | null
  position: UiRuntimeViewPointVector
  target: UiRuntimeViewPointVector
  up: UiRuntimeViewPointVector
}

export type UiRuntimeViewPointRestoreOpts = {
  emit?: boolean
}

export type UiRuntimeDisplayCenterChange = {
  displayId: UiDisplayId
  centerMm: UiRuntimeViewPointVector
}

export type UiRuntimeDisplayLongPress = {
  displayId: UiDisplayId
}

export type UiVirtualDisplayOpts = {
  /** Начальное состояние дистанции. Default "near" сохраняет текущий плоский вид. */
  initial?: UiVirtualDisplayMode
  /** Физическая ширина дисплея в world units/mm. Default вычисляется один раз по первому canvas-size. */
  widthMm?: number
  /** Физическая высота дисплея в world units/mm. Default вычисляется один раз по первому canvas-size. */
  heightMm?: number
  /** Логическая ширина пиксельной сетки дисплея. Default — первый canvas width. */
  pixelWidth?: number
  /** Логическая высота пиксельной сетки дисплея. Default — первый canvas height. */
  pixelHeight?: number
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
  /** Создать встроенный surface-display для addSurface(). */
  surfaceDisplay?: boolean
  /** Long press on a far-mode display starts display positioning. Default 360ms. */
  displayDragLongPressMs?: number
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
  /** Вызывается при пользовательском или программном изменении камеры. */
  onViewPointChange?: (snapshot: UiRuntimeViewPointSnapshot) => void
  /** Вызывается, когда пользователь переместил UIDisplay long-press drag'ом. */
  onDisplayCenterChange?: (change: UiRuntimeDisplayCenterChange) => void
  /** Вызывается, когда touch long-press удержан на UIDisplay в Space overview. */
  onDisplayLongPress?: (event: UiRuntimeDisplayLongPress) => void
}

const DEFAULT_FONT_URL = "/JetBrainsMono-Bold.ttf"
const TOUCH_DISPLAY_LONG_PRESS_MS = 520
const TOUCH_DISPLAY_LONG_PRESS_MOVE_PX = 12
const DISPLAY_NEAR_FIT_PADDING = 1.002

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
  readonly #displaySlots = new Map<UiDisplayId, DisplaySlot>()
  readonly #surfaceDisplayId: UiDisplayId = "__surface__"
  #surfaceOrder = 0
  #windowOrder = 0
  readonly #windowOrders = new Map<string, number>()
  readonly #windowZIndexes = new Map<string, number>()
  #activeWindowId: string | null = null
  #activeDisplayId: UiDisplayId | null = null
  #focused: UiSurfaceNode | null = null
  #pixelWidth = 800
  #pixelHeight = 600
  #pixelScale = 0.001
  #displayPixelWidth = 800
  #displayPixelHeight = 600
  #displayPixelScale = 0.001
  #displayGeometryInitialized = false
  #sizeInitialized = false
  readonly #cameraDistanceMm: number
  readonly #virtualDisplayWidthMm: number | undefined
  readonly #virtualDisplayHeightMm: number | undefined
  readonly #virtualDisplayPixelWidth: number | undefined
  readonly #virtualDisplayPixelHeight: number | undefined
  readonly #displayNearDistanceMm: number
  readonly #displayFarDistanceMm: number
  readonly #displayFlyDurationMs: number
  readonly #displayDragLongPressMs: number
  readonly #displayCenterMm: Vector3
  readonly #displaySpaceEnabled: boolean
  #displayMode: UiVirtualDisplayMode
  #displayReturnPose: ViewPointPose | null = null
  #displayDistanceMm: number
  #displayNavigationActive = false
  #displayNavigationLastX = 0
  #displayNavigationLastY = 0
  #displayDragCandidate: DisplayDragCandidate | null = null
  #displayDragActive: DisplayDragActive | null = null
  #displayHoverActive = false
  #displayHoverDisplayId: UiDisplayId | null = null
  #displayNavigationDisplayId: UiDisplayId | null = null
  readonly #onViewPointChange: ((snapshot: UiRuntimeViewPointSnapshot) => void) | undefined
  readonly #onDisplayCenterChange: ((change: UiRuntimeDisplayCenterChange) => void) | undefined
  readonly #onDisplayLongPress: ((event: UiRuntimeDisplayLongPress) => void) | undefined
  #cameraAnimationRafId: number | null = null
  #disposed = false
  #renderRequested = false
  #rafId: number | null = null
  #pressedSlot: SurfaceSlot | null = null
  #hoveredSlot: SurfaceSlot | null = null
  #activeTouchId: number | null = null
  #displayTouchGesture: DisplayTouchGesture | null = null
  #lastTouchEventAt = 0
  #claimNextClick = false
  readonly #handleWheel = (event: WheelEvent): void => this.#onWheel(event)
  readonly #handleMouseMove = (event: MouseEvent): void => this.#onMouseMove(event)
  readonly #handleMouseDown = (event: MouseEvent): void => this.#onMouseDown(event)
  readonly #handleMouseUp = (event: MouseEvent): void => this.#onMouseUp(event)
  readonly #handleClick = (event: MouseEvent): void => this.#onClick(event)
  readonly #handleMouseLeave = (): void => this.#onMouseLeave()
  readonly #handleTouchStart = (event: TouchEvent): void => this.#onTouchStart(event)
  readonly #handleTouchMove = (event: TouchEvent): void => this.#onTouchMove(event)
  readonly #handleTouchEnd = (event: TouchEvent): void => this.#onTouchEnd(event)
  readonly #handleTouchCancel = (event: TouchEvent): void => this.#onTouchCancel(event)
  readonly #handleContextMenu = (event: MouseEvent): void => this.#onContextMenu(event)
  readonly #handleKey = (event: KeyboardEvent): void => this.#onKey(event)
  readonly #handleWindowKey = (event: KeyboardEvent): void => this.#onWindowKey(event)
  readonly #handleWindowBlur = (): void => {
    if (this.inputProxy?.softKeyboardActive() === true) return
    this.#clearKeyboardFocus()
  }
  readonly #handleVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") this.#clearKeyboardFocus()
  }

  /** Debug alias for callers that inspect the rendered object tree. */
  get scene(): Space {
    return this.space
  }

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer, font: TrueTypeFont, opts: UiRuntimeOpts) {
    this.canvas = canvas
    this.renderer = renderer
    this.font = font
    this.#onViewPointChange = opts.onViewPointChange
    this.#onDisplayCenterChange = opts.onDisplayCenterChange
    this.#onDisplayLongPress = opts.onDisplayLongPress
    this.#cameraDistanceMm = opts.cameraDistanceMm ?? 600
    const virtualDisplay = opts.virtualDisplay
    this.#virtualDisplayWidthMm = virtualDisplay?.widthMm
    this.#virtualDisplayHeightMm = virtualDisplay?.heightMm
    this.#virtualDisplayPixelWidth = virtualDisplay?.pixelWidth
    this.#virtualDisplayPixelHeight = virtualDisplay?.pixelHeight
    this.#displayPixelWidth = Math.max(1, Math.round(this.#virtualDisplayPixelWidth ?? this.#displayPixelWidth))
    this.#displayPixelHeight = Math.max(1, Math.round(this.#virtualDisplayPixelHeight ?? this.#displayPixelHeight))
    this.#displayNearDistanceMm = Math.max(1, virtualDisplay?.nearDistanceMm ?? this.#cameraDistanceMm)
    this.#displayFarDistanceMm = Math.max(
      this.#displayNearDistanceMm,
      virtualDisplay?.farDistanceMm ?? this.#displayNearDistanceMm * 2,
    )
    this.#displayFlyDurationMs = Math.max(0, virtualDisplay?.flyDurationMs ?? 700)
    this.#displayDragLongPressMs = Math.max(0, virtualDisplay?.displayDragLongPressMs ?? 360)
    this.#displayCenterMm = virtualDisplay?.centerMm === undefined
      ? new Vector3(0, 0, 900)
      : new Vector3(virtualDisplay.centerMm.x, virtualDisplay.centerMm.y, virtualDisplay.centerMm.z)
    this.#displaySpaceEnabled = virtualDisplay !== undefined
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
    const createSurfaceDisplay = virtualDisplay !== undefined && virtualDisplay.surfaceDisplay !== false
    this.display = !createSurfaceDisplay
      ? null
      : new UIDisplay({
        widthMm: this.#virtualDisplayWidthMm ?? 1,
        heightMm: this.#virtualDisplayHeightMm ?? 1,
        pixelWidth: Math.max(1, Math.round(this.#virtualDisplayPixelWidth ?? 1)),
        pixelHeight: Math.max(1, Math.round(this.#virtualDisplayPixelHeight ?? 1)),
        ...(virtualDisplay.background === undefined ? {} : {background: virtualDisplay.background}),
      })
    if (this.display !== null) {
      this.display.name = "UiRuntimeDisplay"
      this.display.frustumCulled = false
      this.space.add(this.display)
      this.#displaySlots.set(this.#surfaceDisplayId, {
        id: this.#surfaceDisplayId,
        display: this.display,
        centerMm: this.#displayCenterMm.clone(),
        pixelWidth: this.#displayPixelWidth,
        pixelHeight: this.#displayPixelHeight,
        pixelScale: this.#displayPixelScale,
        geometryInitialized: false,
        ...(this.#virtualDisplayWidthMm === undefined ? {} : {explicitWidthMm: this.#virtualDisplayWidthMm}),
        ...(this.#virtualDisplayHeightMm === undefined ? {} : {explicitHeightMm: this.#virtualDisplayHeightMm}),
        ...(this.#virtualDisplayPixelWidth === undefined ? {} : {explicitPixelWidth: this.#virtualDisplayPixelWidth}),
        ...(this.#virtualDisplayPixelHeight === undefined ? {} : {explicitPixelHeight: this.#virtualDisplayPixelHeight}),
      })
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
    if (virtualDisplay === undefined) {
      this.viewPoint.getUp().set(0, 1, 0)
    } else {
      this.viewPoint.alignUpToWorldZ()
    }
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
  addSurface(surface: UiSurfaceNode, layout: UiSurfaceLayoutFn, opts: UiSurfaceLayerOpts = {}): void {
    if (this.#displaySpaceEnabled && this.display === null) {
      throw new Error("addSurface requires an explicit UIDisplay in display-space mode")
    }
    this.addSurfaceToDisplay(this.#surfaceDisplayId, surface, layout, opts)
  }

  /** Регистрирует surface на конкретном UIDisplay внутри общего Space. */
  addSurfaceToDisplay(displayId: UiDisplayId, surface: UiSurfaceNode, layout: UiSurfaceLayoutFn, opts: UiSurfaceLayerOpts = {}): void {
    const displaySlot = this.#displaySlots.get(displayId)
    if (this.#displaySpaceEnabled && displaySlot === undefined) {
      throw new Error(`UIDisplay not found: ${displayId}`)
    }
    surface.attachCanvas(this)
    surface.setFramebufferClipSpace?.("display")
    surface.setFramebufferDisplayId?.(displayId)
    if (displaySlot === undefined) this.space.add(surface.node)
    else displaySlot.display.add(surface.node)
    const metrics = this.#surfaceMetrics("display", displayId)
    const rect = layout({w: metrics.w, h: metrics.h})
    const windowId = this.#surfaceWindowId(opts)
    this.#surfaces.push({
      surface,
      layout,
      rect,
      target: "display",
      displayId,
      order: this.#surfaceOrder++,
      windowZIndex: this.#surfaceWindowZIndexFor(windowId, opts),
      zIndex: windowId === null ? 0 : opts.zIndex ?? 0,
      windowId,
      windowOrder: this.#windowOrderFor(windowId),
    })
    this.#syncActiveSurfaceStates()
    this.#sortSurfaceSlots()
    this.#applyLayout({scope: "space"})
    this.requestRender()
  }

  /** Регистрирует HUD-surface поверх Space в camera/head-locked слое. */
  addHudSurface(surface: UiSurfaceNode, layout: UiSurfaceLayoutFn, opts: UiSurfaceLayerOpts = {}): void {
    surface.attachCanvas(this)
    surface.setFramebufferClipSpace?.("screen")
    this.hud.add(surface.node)
    const metrics = this.#surfaceMetrics("hud")
    const rect = layout({w: metrics.w, h: metrics.h})
    const windowId = this.#surfaceWindowId(opts)
    this.#surfaces.push({
      surface,
      layout,
      rect,
      target: "hud",
      order: this.#surfaceOrder++,
      windowZIndex: this.#surfaceWindowZIndexFor(windowId, opts),
      zIndex: windowId === null ? 0 : opts.zIndex ?? 0,
      windowId,
      windowOrder: this.#windowOrderFor(windowId),
    })
    this.#syncActiveSurfaceStates()
    this.#sortSurfaceSlots()
    this.#applyLayout({scope: "hud"})
    this.requestRender()
  }

  createDisplay(options: UiRuntimeDisplayOpts): UIDisplay {
    const id = options.id.trim()
    if (id.length === 0) throw new Error("UIDisplay id must be non-empty")
    if (this.#displaySlots.has(id)) throw new Error(`UIDisplay already exists: ${id}`)
    const pixelWidth = Math.max(1, Math.round(options.pixelWidth))
    const pixelHeight = Math.max(1, Math.round(options.pixelHeight))
    const widthMm = Math.max(1, options.widthMm)
    const heightMm = Math.max(1, options.heightMm)
    const display = new UIDisplay({
      widthMm,
      heightMm,
      pixelWidth,
      pixelHeight,
      ...(options.background === undefined ? {} : {background: options.background}),
      ...(options.border === undefined ? {} : {border: options.border}),
    })
    display.name = `UiRuntimeDisplay:${id}`
    display.frustumCulled = false
    this.space.add(display)
    const slot: DisplaySlot = {
      id,
      display,
      centerMm: new Vector3(options.centerMm.x, options.centerMm.y, options.centerMm.z),
      pixelWidth,
      pixelHeight,
      pixelScale: widthMm / pixelWidth,
      geometryInitialized: true,
      explicitWidthMm: widthMm,
      explicitHeightMm: heightMm,
      explicitPixelWidth: pixelWidth,
      explicitPixelHeight: pixelHeight,
    }
    this.#displaySlots.set(id, slot)
    this.#applyDisplayTransform(slot)
    this.#applyLayout({scope: "space"})
    this.requestRender()
    return display
  }

  removeDisplay(displayId: UiDisplayId): boolean {
    if (!this.#displaySpaceEnabled || displayId === this.#surfaceDisplayId) return false
    const slot = this.#displaySlots.get(displayId)
    if (slot === undefined) return false

    this.#clearKeyboardFocus()
    for (let index = this.#surfaces.length - 1; index >= 0; index--) {
      const surfaceSlot = this.#surfaces[index]!
      if (surfaceSlot.target !== "display" || surfaceSlot.displayId !== displayId) continue
      surfaceSlot.surface.dispose?.()
      this.#surfaces.splice(index, 1)
    }

    this.#displaySlots.delete(displayId)
    this.space.remove(slot.display)
    if (this.#activeDisplayId === displayId) this.#activeDisplayId = null
    if (this.#displayHoverDisplayId === displayId) this.#displayHoverDisplayId = null
    if (this.#displayNavigationDisplayId === displayId) this.#displayNavigationDisplayId = null
    this.#displayDragCandidate = this.#displayDragCandidate?.displayId === displayId ? null : this.#displayDragCandidate
    if (this.#displayDragActive?.displayId === displayId) this.#displayDragActive = null
    this.#applyLayout({scope: "space"})
    this.#requestHudSurfacesRender()
    this.requestRender()
    return true
  }

  setDisplayCenter(displayId: UiDisplayId, centerMm: {x: number; y: number; z: number}): void {
    this.#setDisplayCenter(displayId, centerMm, false)
  }

  #setDisplayCenter(displayId: UiDisplayId, centerMm: {x: number; y: number; z: number}, emit: boolean): void {
    const slot = this.#displaySlots.get(displayId)
    if (slot === undefined) throw new Error(`UIDisplay not found: ${displayId}`)
    slot.centerMm.set(centerMm.x, centerMm.y, centerMm.z)
    if (displayId === this.#surfaceDisplayId) this.#displayCenterMm.copy(slot.centerMm)
    this.#applyDisplayTransform(slot)
    this.#applyLayout({scope: "space"})
    this.requestRender()
    if (emit) {
      this.#onDisplayCenterChange?.({
        displayId,
        centerMm: vectorSnapshot(slot.centerMm),
      })
    }
  }

  displayMetrics(displayId: UiDisplayId): {widthMm: number; heightMm: number; pixelWidth: number; pixelHeight: number} | null {
    this.#applyDisplayGeometry()
    const slot = this.#displaySlots.get(displayId)
    if (slot === undefined) return null
    return {
      widthMm: slot.display.widthMm,
      heightMm: slot.display.heightMm,
      pixelWidth: slot.pixelWidth,
      pixelHeight: slot.pixelHeight,
    }
  }

  viewportDisplayMetrics(): {widthMm: number; heightMm: number; pixelWidth: number; pixelHeight: number} {
    this.#applyDisplayGeometry()
    const pixelWidth = Math.max(1, Math.round(this.#pixelWidth))
    const pixelHeight = Math.max(1, Math.round(this.#pixelHeight))
    const pixelAspect = pixelWidth / pixelHeight
    const heightMm = Math.max(1, 2 * this.#displayNearDistanceMm * Math.tan(this.viewPoint.fov / 2))
    return {
      widthMm: Math.max(1, heightMm * pixelAspect),
      heightMm,
      pixelWidth,
      pixelHeight,
    }
  }

  resizeDisplay(displayId: UiDisplayId, metrics: {widthMm: number; heightMm: number; pixelWidth: number; pixelHeight: number}): void {
    const slot = this.#displaySlots.get(displayId)
    if (slot === undefined) throw new Error(`UIDisplay not found: ${displayId}`)
    const widthMm = Math.max(1, metrics.widthMm)
    const heightMm = Math.max(1, metrics.heightMm)
    const pixelWidth = Math.max(1, Math.round(metrics.pixelWidth))
    const pixelHeight = Math.max(1, Math.round(metrics.pixelHeight))
    if (
      slot.geometryInitialized &&
      slot.display.widthMm === widthMm &&
      slot.display.heightMm === heightMm &&
      slot.pixelWidth === pixelWidth &&
      slot.pixelHeight === pixelHeight
    ) {
      return
    }

    slot.explicitWidthMm = widthMm
    slot.explicitHeightMm = heightMm
    slot.explicitPixelWidth = pixelWidth
    slot.explicitPixelHeight = pixelHeight
    slot.pixelWidth = pixelWidth
    slot.pixelHeight = pixelHeight
    slot.pixelScale = widthMm / pixelWidth
    slot.geometryInitialized = true
    if (displayId === this.#surfaceDisplayId) {
      this.#displayPixelWidth = pixelWidth
      this.#displayPixelHeight = pixelHeight
      this.#displayPixelScale = slot.pixelScale
      this.#displayGeometryInitialized = true
    }
    slot.display.resize({widthMm, heightMm, pixelWidth, pixelHeight}, {
      invalidateGeometry: (geometry) => this.renderer.invalidateGeometry(geometry),
    })
    this.#applyDisplayTransform(slot)
    this.#applyLayout({scope: "space"})
    this.requestRender()
  }

  frameDisplays(displayIds?: readonly UiDisplayId[], opts: {padding?: number} = {}): void {
    const slots = (displayIds ?? [...this.#displaySlots.keys()])
      .map((id) => this.#displaySlots.get(id))
      .filter((slot): slot is DisplaySlot => slot !== undefined)
    if (slots.length === 0) return

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    let y = 0
    for (const slot of slots) {
      minX = Math.min(minX, slot.centerMm.x - slot.display.widthMm / 2)
      maxX = Math.max(maxX, slot.centerMm.x + slot.display.widthMm / 2)
      minZ = Math.min(minZ, slot.centerMm.z - slot.display.heightMm / 2)
      maxZ = Math.max(maxZ, slot.centerMm.z + slot.display.heightMm / 2)
      y += slot.centerMm.y
    }
    const target = new Vector3((minX + maxX) / 2, y / slots.length, (minZ + maxZ) / 2)
    const spanW = Math.max(1, maxX - minX)
    const spanH = Math.max(1, maxZ - minZ)
    const aspect = Math.max(0.1, this.#pixelWidth / Math.max(1, this.#pixelHeight))
    const verticalDistance = (spanH / 2) / Math.tan(this.viewPoint.fov / 2)
    const horizontalDistance = (spanW / 2) / (Math.tan(this.viewPoint.fov / 2) * aspect)
    const padding = Math.max(1, Math.min(2, opts.padding ?? 1.2))
    const distance = Math.max(this.#displayNearDistanceMm, verticalDistance, horizontalDistance) * padding
    this.#cancelCameraAnimation()
    this.#displayMode = "far"
    this.viewPoint.getTarget().copy(target)
    this.viewPoint.position.copy(target).add(new Vector3(0, -distance, 0))
    this.viewPoint.getUp().set(0, 0, 1)
    this.viewPoint.update()
    this.#displayDistanceMm = distance
    this.#applyLayout({scope: "space"})
    this.#requestHudSurfacesRender()
    this.requestRender()
    this.#emitViewPointChange()
  }

  relayout(opts: UiRuntimeRelayoutOpts = {}): void {
    this.#applyLayout(opts)
    this.requestRender()
  }

  surfaceFrame(surface: UiSurfaceNode): {rect: UiSurfaceRect; bounds: {w: number; h: number}} | null {
    const slot = this.#surfaces.find((item) => item.surface === surface)
    if (slot === undefined) return null
    const metrics = this.#surfaceMetrics(slot.target, slot.displayId)
    return {
      rect: {...slot.rect},
      bounds: {w: metrics.w, h: metrics.h},
    }
  }

  setSurfaceRect(surface: UiSurfaceNode, rect: UiSurfaceRect): UiSurfaceRect | null {
    const slot = this.#surfaces.find((item) => item.surface === surface)
    if (slot === undefined) return null
    const metrics = this.#surfaceMetrics(slot.target, slot.displayId)
    const next = clampSurfaceRect(rect, metrics.w, metrics.h)
    slot.rectOverride = next
    this.#applySurfaceSlotRect(slot, next, metrics, false)
    this.requestRender()
    return {...next}
  }

  clearSurfaceRect(surface: UiSurfaceNode): void {
    const slot = this.#surfaces.find((item) => item.surface === surface)
    if (slot === undefined || slot.rectOverride === undefined) return
    delete slot.rectOverride
    this.#applyLayout({scope: slot.target === "hud" ? "hud" : "space"})
    this.requestRender()
  }

  get displayMode(): UiVirtualDisplayMode {
    return this.#displayMode
  }

  get activeDisplayId(): UiDisplayId | null {
    return this.#activeDisplayId
  }

  displayTargetId(): UiDisplayId | null {
    return this.#resolveDisplayId()
  }

  viewPointSnapshot(): UiRuntimeViewPointSnapshot {
    return this.#viewPointSnapshot()
  }

  restoreViewPointSnapshot(snapshot: UiRuntimeViewPointSnapshot, opts: UiRuntimeViewPointRestoreOpts = {}): boolean {
    const position = vectorFromSnapshot(snapshot.position)
    const target = vectorFromSnapshot(snapshot.target)
    const up = vectorFromSnapshot(snapshot.up)
    if (position === null || target === null || up === null) return false
    if (position.distanceTo(target) < 0.001 || up.length() < 0.001) return false
    const mode = snapshot.displayMode
    if (mode !== "near" && mode !== "far") return false

    this.#cancelCameraAnimation()
    this.#displayMode = mode
    this.#activeDisplayId = snapshot.activeDisplayId !== null && this.#displaySlots.has(snapshot.activeDisplayId)
      ? snapshot.activeDisplayId
      : null
    this.#displayHoverDisplayId = null
    this.#displayNavigationDisplayId = null
    this.#displayReturnPose = null
    this.viewPoint.position.copy(position)
    this.viewPoint.getTarget().copy(target)
    this.viewPoint.getUp().copy(up.normalize())
    this.viewPoint.update()
    this.#displayDistanceMm = this.viewPoint.position.distanceTo(target)
    this.#applyLayout({scope: "space"})
    this.#requestHudSurfacesRender()
    this.requestRender()
    if (opts.emit === true) this.#emitViewPointChange()
    return true
  }

  setDisplayMode(mode: UiVirtualDisplayMode): void {
    if (!this.#displaySpaceEnabled) return
    const nextDistance = mode === "near" ? this.#displayNearFitDistanceMm(this.#activeDisplayId) : this.#displayFarDistanceMm
    if (this.#displayMode === mode && Math.abs(nextDistance - this.#currentDisplayDistance()) < 0.001) return
    const previousMode = this.#displayMode
    if (mode === "near" && previousMode === "far") this.#displayReturnPose = this.#captureViewPointPose()
    this.#displayMode = mode
    if (mode === "far") this.#clearKeyboardFocus()
    if (mode === "far" && this.#displayReturnPose !== null) {
      const pose = this.#displayReturnPose
      this.#displayReturnPose = null
      this.#animateCameraToPose(pose)
      return
    }
    this.#animateCameraToDisplayDistance(nextDistance)
  }

  focusDisplay(displayId: UiDisplayId): boolean {
    if (!this.#displaySpaceEnabled || !this.#displaySlots.has(displayId)) return false
    if (this.#displayMode === "far") this.#displayReturnPose = this.#captureViewPointPose()
    this.#activeDisplayId = displayId
    this.#displayHoverDisplayId = displayId
    this.#displayNavigationDisplayId = null
    this.#displayMode = "near"
    this.#animateCameraToDisplayDistance(this.#displayNearFitDistanceMm(displayId))
    return true
  }

  refitDisplay(displayId: UiDisplayId | null = this.#activeDisplayId): boolean {
    if (!this.#displaySpaceEnabled || displayId === null || !this.#displaySlots.has(displayId)) return false
    this.#activeDisplayId = displayId
    this.#displayHoverDisplayId = displayId
    this.#displayNavigationDisplayId = null
    this.#displayMode = "near"
    this.#animateCameraToDisplayDistance(this.#displayNearFitDistanceMm(displayId))
    return true
  }

  displaySnapshots(): UiRuntimeDisplaySnapshot[] {
    this.#applyDisplayGeometry()
    const snapshots: UiRuntimeDisplaySnapshot[] = []
    for (const slot of this.#displaySlots.values()) {
      const outline = this.displayOutline(slot.id)
      const screenRect = outline === null ? null : rectFromOutline(outline)
      const screenCenter = outline === null ? null : centerFromOutline(outline)
      const visible = screenRect !== null
        && screenRect.x + screenRect.w >= 0
        && screenRect.y + screenRect.h >= 0
        && screenRect.x <= this.#pixelWidth
        && screenRect.y <= this.#pixelHeight
      snapshots.push({
        id: slot.id,
        active: slot.id === this.#activeDisplayId,
        hovered: slot.id === this.#displayHoverDisplayId,
        visible,
        centerMm: {x: slot.centerMm.x, y: slot.centerMm.y, z: slot.centerMm.z},
        metrics: {
          widthMm: slot.display.widthMm,
          heightMm: slot.display.heightMm,
          pixelWidth: slot.pixelWidth,
          pixelHeight: slot.pixelHeight,
        },
        screenCenter,
        screenRect,
        outline,
      })
    }
    return snapshots
  }

  uiRectToFramebufferClipBounds(
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
    displayId = this.#surfaceDisplayId,
  ): [number, number, number, number] {
    if (!this.#displaySpaceEnabled) {
      const dpr = this.renderer.pixelRatio
      return [
        Math.min(xMin, xMax) * dpr,
        Math.min(yMin, yMax) * dpr,
        Math.max(xMin, xMax) * dpr,
        Math.max(yMin, yMax) * dpr,
      ]
    }

    const p0 = this.#projectDisplayUiPoint(xMin, yMin, displayId)
    const p1 = this.#projectDisplayUiPoint(xMax, yMin, displayId)
    const p2 = this.#projectDisplayUiPoint(xMax, yMax, displayId)
    const p3 = this.#projectDisplayUiPoint(xMin, yMax, displayId)
    const xs = [p0.x, p1.x, p2.x, p3.x]
    const ys = [p0.y, p1.y, p2.y, p3.y]
    return [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ]
  }

  displayHoverOutline(): UiDisplayHoverOutline | null {
    if (!this.#displayHoverActive) return null
    return this.displayOutline(this.#displayHoverDisplayId ?? this.#activeDisplayId)
  }

  displayOutline(displayId?: UiDisplayId | null): UiDisplayHoverOutline | null {
    const resolvedDisplayId = this.#resolveDisplayId(displayId)
    if (resolvedDisplayId === null) return null
    const slot = this.#displaySlots.get(resolvedDisplayId)
    if (slot === undefined) return null
    const w = slot.display.widthMm / 2
    const h = slot.display.heightMm / 2
    this.viewPoint.update()
    this.space.updateWorldMatrix()

    const topLeft = this.#projectWorldPointToCanvas(new Vector3(-w, h, 0).applyMatrix4(slot.display.matrixWorld))
    const topRight = this.#projectWorldPointToCanvas(new Vector3(w, h, 0).applyMatrix4(slot.display.matrixWorld))
    const bottomRight = this.#projectWorldPointToCanvas(new Vector3(w, -h, 0).applyMatrix4(slot.display.matrixWorld))
    const bottomLeft = this.#projectWorldPointToCanvas(new Vector3(-w, -h, 0).applyMatrix4(slot.display.matrixWorld))
    if (topLeft === null || topRight === null || bottomRight === null || bottomLeft === null) return null
    return {topLeft, topRight, bottomRight, bottomLeft}
  }

  displayDistanceMm(): number {
    return this.#currentDisplayDistance(this.#activeDisplayId)
  }

  #projectDisplayUiPoint(x: number, y: number, displayId = this.#surfaceDisplayId): {x: number; y: number} {
    const dpr = this.renderer.pixelRatio
    if (!this.#displaySpaceEnabled) return {x: x * dpr, y: y * dpr}
    const slot = this.#displaySlots.get(displayId) ?? this.#displaySlots.get(this.#surfaceDisplayId)
    if (slot === undefined) return {x: x * dpr, y: y * dpr}
    const worldPoint = new Vector3(
      (x - slot.pixelWidth / 2) * slot.pixelScale,
      (slot.pixelHeight / 2 - y) * slot.pixelScale,
      0,
    ).applyMatrix4(slot.display.matrixWorld)
    const viewProjection = new Matrix4().multiplyMatrices(this.viewPoint.projectionMatrix, this.viewPoint.viewMatrix)
    const ndc = worldPoint.applyMatrix4(viewProjection)
    return {
      x: (ndc.x * 0.5 + 0.5) * this.#pixelWidth * dpr,
      y: (0.5 - ndc.y * 0.5) * this.#pixelHeight * dpr,
    }
  }

  #projectWorldPointToCanvas(worldPoint: Vector3): {x: number; y: number} | null {
    const viewProjection = new Matrix4().multiplyMatrices(this.viewPoint.projectionMatrix, this.viewPoint.viewMatrix)
    const ndc = worldPoint.clone().applyMatrix4(viewProjection)
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z)) return null
    return {
      x: (ndc.x * 0.5 + 0.5) * this.#pixelWidth,
      y: (0.5 - ndc.y * 0.5) * this.#pixelHeight,
    }
  }

  #currentDisplayDistance(displayId: UiDisplayId | null = this.#activeDisplayId): number {
    const center = this.#displayCenterWorld(displayId)
    if (center === null) return this.#displayDistanceMm
    return this.viewPoint.position.distanceTo(center)
  }

  #resolveDisplayId(displayId?: UiDisplayId | null): UiDisplayId | null {
    if (displayId !== undefined && displayId !== null && this.#displaySlots.has(displayId)) return displayId
    if (this.#displayHoverDisplayId !== null && this.#displaySlots.has(this.#displayHoverDisplayId)) return this.#displayHoverDisplayId
    if (this.#displayNavigationDisplayId !== null && this.#displaySlots.has(this.#displayNavigationDisplayId)) return this.#displayNavigationDisplayId
    if (this.#activeDisplayId !== null && this.#displaySlots.has(this.#activeDisplayId)) return this.#activeDisplayId
    return null
  }

  #displayCenterWorld(displayId: UiDisplayId | null = this.#surfaceDisplayId): Vector3 | null {
    if (displayId === null) return null
    const slot = this.#displaySlots.get(displayId)
    if (slot === undefined) return null
    this.space.updateWorldMatrix()
    const e = slot.display.matrixWorld.elements
    return new Vector3(e[12]!, e[13]!, e[14]!)
  }

  #worldRayPlaneHit(canvasX: number, canvasY: number, planeY: number): Vector3 | null {
    if (!this.#displaySpaceEnabled) return null
    this.viewPoint.update()
    const raycaster = new Raycaster()
    raycaster.setFromCamera({
      x: (canvasX / this.#pixelWidth) * 2 - 1,
      y: 1 - (canvasY / this.#pixelHeight) * 2,
    }, this.viewPoint)
    const directionY = raycaster.ray.direction.y
    if (Math.abs(directionY) < 0.000001) return null
    const distance = (planeY - raycaster.ray.origin.y) / directionY
    if (distance < 0) return null
    return raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(distance))
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

  #viewPointSnapshot(): UiRuntimeViewPointSnapshot {
    return {
      displayMode: this.#displayMode,
      activeDisplayId: this.#activeDisplayId,
      position: vectorSnapshot(this.viewPoint.position),
      target: vectorSnapshot(this.viewPoint.getTarget()),
      up: vectorSnapshot(this.viewPoint.getUp()),
    }
  }

  #emitViewPointChange(): void {
    this.#onViewPointChange?.(this.#viewPointSnapshot())
  }

  #animateCameraToDisplayDistance(distanceMm: number): void {
    if (!this.#displaySpaceEnabled) return
    const target = this.#displayCenterWorld(this.#activeDisplayId) ?? this.viewPoint.getTarget().clone()
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
      this.#applyLayout({scope: "space"})
      this.#requestHudSurfacesRender()
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
        this.#applyLayout({scope: "space"})
        this.#requestHudSurfacesRender()
        this.requestRender()
        this.#emitViewPointChange()
      }
    }

    this.#cameraAnimationRafId = requestAnimationFrame(step)
  }

  #displayNearFitDistanceMm(displayId: UiDisplayId | null = this.#activeDisplayId): number {
    if (displayId === null) return this.#displayNearDistanceMm
    const slot = this.#displaySlots.get(displayId)
    if (slot === undefined) return this.#displayNearDistanceMm
    this.#applyDisplayGeometry()
    const halfFovTan = Math.max(0.001, Math.tan(this.viewPoint.fov / 2))
    const aspect = Math.max(0.1, this.#pixelWidth / Math.max(1, this.#pixelHeight))
    const verticalDistance = (slot.display.heightMm / 2) / halfFovTan
    const horizontalDistance = (slot.display.widthMm / 2) / (halfFovTan * aspect)
    return Math.max(this.viewPoint.near * 2, Math.max(verticalDistance, horizontalDistance) * DISPLAY_NEAR_FIT_PADDING)
  }

  #cancelCameraAnimation(): void {
    if (this.#cameraAnimationRafId === null) return
    cancelAnimationFrame(this.#cameraAnimationRafId)
    this.#cameraAnimationRafId = null
  }

  toggleDisplayFlight(): void {
    this.setDisplayMode(this.displayMode === "near" ? "far" : "near")
  }

  #orbitDisplay(deltaX: number, deltaY: number): void {
    if (!this.#displaySpaceEnabled) return
    this.#cancelCameraAnimation()
    const target = this.#navigationTarget(this.#displayNavigationDisplayId)
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
    this.#applyLayout({scope: "space"})
    this.#requestHudSurfacesRender()
    this.requestRender()
    this.#emitViewPointChange()
  }

  #zoomDisplay(delta: number, displayId?: UiDisplayId | null, anchorCanvas?: {x: number; y: number}): void {
    if (!this.#displaySpaceEnabled) return
    this.#cancelCameraAnimation()
    const resolvedDisplayId = displayId === null ? null : this.#resolveDisplayId(displayId)
    const anchorDisplayId = anchorCanvas === undefined
      ? null
      : this.#displayCoords(anchorCanvas.x, anchorCanvas.y, true, resolvedDisplayId ?? undefined)?.displayId ?? null
    const anchorBefore = anchorCanvas === undefined
      ? null
      : this.#displayWorldPointAtCanvas(anchorCanvas.x, anchorCanvas.y, anchorDisplayId, true)
    const target = this.#navigationTarget(resolvedDisplayId)
    this.viewPoint.getTarget().copy(target)
    const offset = new Vector3().subVectors(this.viewPoint.position, target)
    const currentRadius = Math.max(0.001, offset.length())
    const zoomDelta = clampNumber(delta, -120, 120)
    const scale = Math.pow(0.95, zoomDelta * 0.05)
    const scaledRadius = currentRadius * scale
    const scaledDelta = currentRadius - scaledRadius
    const minZoomDistance = Math.max(1, this.viewPoint.near * 2)
    const minimumRadiusDelta = Math.max(0.01, this.viewPoint.near * 0.2 * Math.abs(zoomDelta) * 0.01)
    const radiusDelta = Math.sign(scaledDelta) * Math.max(Math.abs(scaledDelta), minimumRadiusDelta)
    const nextRadius = Math.max(minZoomDistance, currentRadius - radiusDelta)
    offset.normalize().multiplyScalar(nextRadius)
    this.viewPoint.position.copy(target).add(offset)
    this.viewPoint.update()
    if (anchorBefore !== null && anchorCanvas !== undefined) {
      const anchorAfter = this.#displayWorldPointAtCanvas(anchorCanvas.x, anchorCanvas.y, anchorDisplayId, true)
      if (anchorAfter !== null) {
        const correction = anchorBefore.sub(anchorAfter)
        if (Number.isFinite(correction.x) && Number.isFinite(correction.y) && Number.isFinite(correction.z)) {
          this.viewPoint.position.add(correction)
          this.viewPoint.getTarget().add(correction)
          this.viewPoint.update()
        }
      }
    }
    this.#displayDistanceMm = nextRadius
    this.#applyLayout({scope: "space"})
    this.#requestHudSurfacesRender()
    this.requestRender()
    this.#emitViewPointChange()
  }

  #panView(deltaX: number, deltaY: number): void {
    this.#cancelCameraAnimation()
    this.viewPoint.update()
    const target = this.viewPoint.getTarget()
    const offset = new Vector3().subVectors(this.viewPoint.position, target)
    const panSpeed = 0.001 * Math.max(1, offset.length())
    const te = this.viewPoint.viewMatrix.elements
    const panRight = new Vector3(te[0], te[4], te[8])
    const panUp = new Vector3(te[1], te[5], te[9])
    const panDelta = new Vector3()
      .add(panRight.multiplyScalar(deltaX * panSpeed))
      .add(panUp.multiplyScalar(-deltaY * panSpeed))

    this.viewPoint.position.add(panDelta)
    target.add(panDelta)
    this.viewPoint.update()
    this.#displayDistanceMm = offset.length()
    this.#applyLayout({scope: "space"})
    this.#requestHudSurfacesRender()
    this.requestRender()
    this.#emitViewPointChange()
  }

  #navigationTarget(displayId?: UiDisplayId | null): Vector3 {
    if (displayId !== undefined && displayId !== null) {
      const displayTarget = this.#displayCenterWorld(displayId)
      if (displayTarget !== null) return displayTarget
    }
    return this.viewPoint.getTarget().clone()
  }

  #displayWorldPointAtCanvas(canvasX: number, canvasY: number, displayId: UiDisplayId | null, requireInside: boolean): Vector3 | null {
    if (displayId === null) return null
    const hit = this.#displayRayHit(canvasX, canvasY, requireInside, displayId)
    if (hit === null) return null
    return hit.point.clone().applyMatrix4(hit.display.matrixWorld)
  }

  #displayRayHit(canvasX: number, canvasY: number, requireInside = false, onlyDisplayId?: UiDisplayId): DisplayRayHit | null {
    if (!this.#displaySpaceEnabled) return null
    this.viewPoint.update()
    this.space.updateWorldMatrix()
    const raycaster = new Raycaster()
    raycaster.setFromCamera({
      x: (canvasX / this.#pixelWidth) * 2 - 1,
      y: 1 - (canvasY / this.#pixelHeight) * 2,
    }, this.viewPoint)
    let best: DisplayRayHit | null = null
    const slots = onlyDisplayId === undefined
      ? [...this.#displaySlots.values()]
      : [this.#displaySlots.get(onlyDisplayId)].filter((slot): slot is DisplaySlot => slot !== undefined)

    for (const slot of slots) {
      const inverseDisplay = new Matrix4().copy(slot.display.matrixWorld).invert()
      const localOrigin = raycaster.ray.origin.clone().applyMatrix4(inverseDisplay)
      const localEnd = raycaster.ray.origin.clone().add(raycaster.ray.direction).applyMatrix4(inverseDisplay)
      const localDirection = localEnd.sub(localOrigin).normalize()
      if (Math.abs(localDirection.z) < 0.000001) continue
      const distance = -localOrigin.z / localDirection.z
      if (distance < 0) continue
      const point = localOrigin.clone().add(localDirection.multiplyScalar(distance))
      if (requireInside && !this.#displayPointInside(slot, point)) continue
      if (best === null || distance < best.distance) {
        best = {displayId: slot.id, display: slot.display, point, distance}
      }
    }
    return best
  }

  #displayPointInside(slot: DisplaySlot, point: Vector3): boolean {
    const x = point.x / slot.pixelScale + slot.pixelWidth / 2
    const y = slot.pixelHeight / 2 - point.y / slot.pixelScale
    return x >= 0 && y >= 0 && x <= slot.pixelWidth && y <= slot.pixelHeight
  }

  #beginDisplayNavigation(event: MouseEvent, displayId: UiDisplayId | null): void {
    this.#cancelCameraAnimation()
    this.#displayNavigationActive = true
    this.#displayNavigationDisplayId = displayId
    if (displayId !== null) this.#activeDisplayId = displayId
    this.#displayNavigationLastX = event.clientX
    this.#displayNavigationLastY = event.clientY
    this.canvas.style.cursor = "grabbing"
  }

  #armDisplayDragCandidate(event: MouseEvent, displayId: UiDisplayId): void {
    this.#cancelDisplayDragCandidate()
    if (!this.#isDisplayNavigationMode() || event.button !== 0) return
    const candidate: DisplayDragCandidate = {
      displayId,
      timer: 0,
      startClientX: event.clientX,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    candidate.timer = window.setTimeout(() => this.#beginDisplayDrag(candidate), this.#displayDragLongPressMs)
    this.#displayDragCandidate = candidate
  }

  #cancelDisplayDragCandidate(): void {
    if (this.#displayDragCandidate === null) return
    window.clearTimeout(this.#displayDragCandidate.timer)
    this.#displayDragCandidate = null
  }

  #beginDisplayDrag(candidate: DisplayDragCandidate): void {
    if (this.#displayDragCandidate !== candidate || this.#displayMode !== "far") return
    const slot = this.#displaySlots.get(candidate.displayId)
    if (slot === undefined) {
      this.#cancelDisplayDragCandidate()
      return
    }
    const canvasCoords = this.#clientToCanvasCoords(candidate.clientX, candidate.clientY)
    const hit = this.#worldRayPlaneHit(canvasCoords.x, canvasCoords.y, slot.centerMm.y)
    if (hit === null) {
      this.#cancelDisplayDragCandidate()
      return
    }
    this.#displayDragActive = {
      displayId: candidate.displayId,
      planeY: slot.centerMm.y,
      offset: slot.centerMm.clone().sub(hit),
    }
    this.#pressedSlot = null
    this.#cancelDisplayDragCandidate()
    if (candidate.displayId !== this.#surfaceDisplayId) this.#activeDisplayId = candidate.displayId
    this.canvas.style.cursor = "grabbing"
    this.#setDisplayHoverActive(true, candidate.displayId)
    this.requestRender()
  }

  #updateDisplayDrag(event: MouseEvent): void {
    const active = this.#displayDragActive
    if (active === null) return
    event.preventDefault()
    const canvasCoords = this.#localCoords(event)
    const hit = this.#worldRayPlaneHit(canvasCoords.x, canvasCoords.y, active.planeY)
    if (hit === null) return
    const nextCenter = hit.add(active.offset)
    nextCenter.y = active.planeY
    this.#setDisplayCenter(active.displayId, nextCenter, true)
    this.#setDisplayHoverActive(true, active.displayId)
  }

  #endDisplayDrag(): void {
    if (this.#displayDragActive === null) return
    this.#displayDragActive = null
    this.canvas.style.cursor = this.displayMode === "far" ? "grab" : "default"
  }

  #endDisplayNavigation(): void {
    if (!this.#displayNavigationActive) return
    this.#displayNavigationActive = false
    this.#displayNavigationDisplayId = null
    this.canvas.style.cursor = this.displayMode === "far" ? "grab" : "default"
  }

  #isDisplayNavigationMode(): boolean {
    return this.#displaySpaceEnabled && this.displayMode === "far"
  }

  #setDisplayHoverActive(active: boolean, displayId: UiDisplayId | null = null): void {
    if (this.#displayHoverActive === active && this.#displayHoverDisplayId === displayId) return
    this.#displayHoverActive = active
    this.#displayHoverDisplayId = active ? displayId : null
    if (active && displayId !== null) this.#activeDisplayId = displayId
    this.#requestHudSurfacesRender()
    this.requestRender()
  }

  #requestHudSurfacesRender(): void {
    for (const slot of this.#surfaces) {
      if (slot.target === "hud") slot.surface.requestRender?.()
    }
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
    const physicalHeight = 2 * this.#cameraDistanceMm * Math.tan(this.viewPoint.fov / 2)
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
    if (surface !== null) {
      const slot = this.#surfaces.find((surfaceSlot) => surfaceSlot.surface === surface)
      if (slot !== undefined) this.#activateSurfaceWindow(slot)
    } else {
      this.#deactivateSurfaceWindow()
    }
    if (this.#focused === surface) return
    this.#focused?.onDeactivate?.()
    this.#focused = surface
    surface?.onActivate?.()
    this.requestRender()
  }

  #surfaceWindowId(opts: UiSurfaceLayerOpts): string | null {
    const windowId = opts.windowId?.trim()
    return windowId === undefined || windowId.length === 0 ? null : windowId
  }

  #surfaceWindowZIndexFor(windowId: string | null, opts: UiSurfaceLayerOpts): number {
    if (windowId === null) return opts.zIndex ?? 0
    const existing = this.#windowZIndexes.get(windowId)
    if (existing !== undefined) return existing
    const zIndex = opts.windowZIndex ?? 0
    this.#windowZIndexes.set(windowId, zIndex)
    return zIndex
  }

  #windowOrderFor(windowId: string | null): number {
    if (windowId === null) return 0
    const existing = this.#windowOrders.get(windowId)
    if (existing !== undefined) return existing
    const order = ++this.#windowOrder
    this.#windowOrders.set(windowId, order)
    return order
  }

  #activateSurfaceWindow(slot: SurfaceSlot): void {
    if (slot.windowId === null) {
      this.#deactivateSurfaceWindow()
      return
    }
    const order = ++this.#windowOrder
    this.#windowOrders.set(slot.windowId, order)
    for (const surfaceSlot of this.#surfaces) {
      if (surfaceSlot.windowId === slot.windowId) surfaceSlot.windowOrder = order
    }
    this.#activeWindowId = slot.windowId
    this.#syncActiveSurfaceStates()
    this.#sortSurfaceSlots()
    this.requestRender()
  }

  #deactivateSurfaceWindow(): void {
    if (this.#activeWindowId === null) return
    this.#activeWindowId = null
    this.#syncActiveSurfaceStates()
    this.requestRender()
  }

  #syncActiveSurfaceStates(): void {
    for (const slot of this.#surfaces) {
      slot.surface.setActive?.(slot.windowId !== null && slot.windowId === this.#activeWindowId && slot.zIndex === 0)
    }
  }

  #clearKeyboardFocus(): void {
    this.#cancelDisplayDragCandidate()
    this.#cancelDisplayTouchGesture()
    this.#endDisplayDrag()
    this.setFocused(null)
    this.inputProxy?.blur()
    this.#pressedSlot = null
  }

  dispose(): void {
    this.#disposed = true
    if (this.#rafId !== null) cancelAnimationFrame(this.#rafId)
    this.#cancelCameraAnimation()
    this.canvas.removeEventListener("wheel", this.#handleWheel)
    this.canvas.removeEventListener("mousemove", this.#handleMouseMove)
    this.canvas.removeEventListener("mousedown", this.#handleMouseDown)
    this.canvas.removeEventListener("click", this.#handleClick, true)
    this.canvas.removeEventListener("touchstart", this.#handleTouchStart, true)
    window.removeEventListener("touchmove", this.#handleTouchMove, true)
    window.removeEventListener("touchend", this.#handleTouchEnd, true)
    window.removeEventListener("touchcancel", this.#handleTouchCancel, true)
    this.canvas.removeEventListener("keydown", this.#handleKey)
    this.canvas.removeEventListener("mouseleave", this.#handleMouseLeave)
    this.canvas.removeEventListener("contextmenu", this.#handleContextMenu)
    window.removeEventListener("keydown", this.#handleWindowKey)
    window.removeEventListener("blur", this.#handleWindowBlur)
    document.removeEventListener("visibilitychange", this.#handleVisibilityChange)
    window.removeEventListener("mouseup", this.#handleMouseUp)
    this.#clearKeyboardFocus()
    this.#pressedSlot = null
    this.#hoveredSlot = null
    this.#activeTouchId = null
    this.#claimNextClick = false
    this.#cancelDisplayDragCandidate()
    this.#cancelDisplayTouchGesture()
    this.#displayDragActive = null
    this.#displayNavigationActive = false
    this.inputProxy?.dispose()
    for (const slot of this.#surfaces) slot.surface.dispose?.()
    this.#surfaces.length = 0
  }

  // ────────────────────────── Internal layout ──────────────────────────

  #sortSurfaceSlots(): void {
    this.#surfaces.sort((a, b) => a.windowZIndex - b.windowZIndex || a.windowOrder - b.windowOrder || a.zIndex - b.zIndex || a.order - b.order)
    this.#syncSurfaceNodeOrder()
  }

  #syncSurfaceNodeOrder(): void {
    const parents = new Set<Object3D>()
    for (const slot of this.#surfaces) {
      const parent = this.#surfaceParent(slot)
      if (parent !== null) parents.add(parent)
    }

    for (const parent of parents) {
      for (const slot of this.#surfaces) {
        if (this.#surfaceParent(slot) === parent) parent.add(slot.surface.node)
      }
    }
  }

  #surfaceParent(slot: SurfaceSlot): Object3D | null {
    if (slot.target === "hud") return this.hud
    const displaySlot = this.#displaySlots.get(slot.displayId ?? this.#surfaceDisplayId)
    return displaySlot?.display ?? this.space
  }

  #applyLayout(opts: UiRuntimeRelayoutOpts = {}): void {
    this.#applyDisplayGeometry()
    this.space.updateWorldMatrix()
    for (const slot of this.#surfaces) {
      if (opts.scope === "hud" && slot.target !== "hud") continue
      if (opts.scope === "space" && slot.target !== "display") continue
      const metrics = this.#surfaceMetrics(slot.target, slot.displayId)
      const layoutRect = slot.layout({w: metrics.w, h: metrics.h})
      const nextRect = layoutRect.visible === false || slot.rectOverride === undefined
        ? layoutRect
        : clampSurfaceRect(slot.rectOverride, metrics.w, metrics.h)
      if (layoutRect.visible !== false && slot.rectOverride !== undefined) slot.rectOverride = nextRect
      this.#applySurfaceSlotRect(slot, nextRect, metrics, opts.forceSetRect ?? true)
    }
  }

  #applySurfaceSlotRect(
    slot: SurfaceSlot,
    rect: UiSurfaceRect,
    metrics: {w: number; h: number; scale: number},
    forceSetRect: boolean,
  ): void {
    const previous = slot.rect
    const previousScale = slot.pixelScale
    slot.rect = rect
    slot.pixelScale = metrics.scale
    const visible = rect.visible !== false && rect.w > 0 && rect.h > 0
    slot.surface.node.visible = visible
    if (!visible) {
      this.#releaseHiddenSurfaceSlot(slot)
      return
    }

    slot.surface.node.position.x = (rect.x - metrics.w / 2) * metrics.scale
    slot.surface.node.position.y = (metrics.h / 2 - rect.y) * metrics.scale
    slot.surface.node.updateMatrix()

    const sizeChanged = previous.w !== rect.w || previous.h !== rect.h || previous.visible === false || rect.visible === false
    const scaleChanged = previousScale === undefined || previousScale !== metrics.scale
    if (forceSetRect || sizeChanged || scaleChanged) {
      slot.surface.setRect(rect, metrics.scale, this.font)
    } else if (previous.x !== rect.x || previous.y !== rect.y) {
      slot.surface.moveRect?.(rect, metrics.scale, this.font) ?? slot.surface.setRect(rect, metrics.scale, this.font)
    }
  }

  #releaseHiddenSurfaceSlot(slot: SurfaceSlot): void {
    if (this.#hoveredSlot === slot) {
      slot.surface.onPointerLeave?.()
      this.#hoveredSlot = null
    }
    if (this.#pressedSlot === slot) {
      this.#pressedSlot = null
      this.#activeTouchId = null
      this.#claimNextClick = false
    }
    if (this.#focused === slot.surface) {
      this.setFocused(null)
      this.inputProxy?.blur()
    }
  }

  #applyDisplayGeometry(): void {
    const surfaceSlot = this.#displaySlots.get(this.#surfaceDisplayId)
    if (surfaceSlot === undefined) {
      for (const slot of this.#displaySlots.values()) this.#applyDisplayTransform(slot)
      return
    }

    if (
      !this.#sizeInitialized &&
      (this.#virtualDisplayPixelWidth === undefined || this.#virtualDisplayPixelHeight === undefined)
    ) {
      this.#applyDisplayTransform(surfaceSlot)
      return
    }

    const pixelWidth = Math.max(1, Math.round(surfaceSlot.explicitPixelWidth ?? this.#pixelWidth))
    const pixelHeight = Math.max(1, Math.round(surfaceSlot.explicitPixelHeight ?? this.#pixelHeight))
    const pixelAspect = pixelWidth / pixelHeight
    const surfaceHeightMm = 2 * this.#displayNearDistanceMm * Math.tan(this.viewPoint.fov / 2)
    const heightMm = Math.max(
      1,
      surfaceSlot.explicitHeightMm ?? (
        surfaceSlot.explicitWidthMm === undefined ? surfaceHeightMm : surfaceSlot.explicitWidthMm / pixelAspect
      ),
    )
    const widthMm = Math.max(1, surfaceSlot.explicitWidthMm ?? heightMm * pixelAspect)
    if (
      !surfaceSlot.geometryInitialized ||
      surfaceSlot.display.widthMm !== widthMm ||
      surfaceSlot.display.heightMm !== heightMm ||
      surfaceSlot.pixelWidth !== pixelWidth ||
      surfaceSlot.pixelHeight !== pixelHeight
    ) {
      this.#displayPixelWidth = pixelWidth
      this.#displayPixelHeight = pixelHeight
      this.#displayPixelScale = widthMm / pixelWidth
      this.#displayGeometryInitialized = true
      surfaceSlot.pixelWidth = pixelWidth
      surfaceSlot.pixelHeight = pixelHeight
      surfaceSlot.pixelScale = this.#displayPixelScale
      surfaceSlot.geometryInitialized = true
      surfaceSlot.display.resize({
        widthMm,
        heightMm,
        pixelWidth,
        pixelHeight,
      }, {
        invalidateGeometry: (geometry) => this.renderer.invalidateGeometry(geometry),
      })
    }
    for (const slot of this.#displaySlots.values()) this.#applyDisplayTransform(slot)
  }

  #surfaceMetrics(target: SurfaceSlot["target"], displayId = this.#surfaceDisplayId): {w: number; h: number; scale: number} {
    if (target === "display" && this.#displaySpaceEnabled) {
      const slot = this.#displaySlots.get(displayId) ?? this.#displaySlots.get(this.#surfaceDisplayId)
      if (slot !== undefined) return {w: slot.pixelWidth, h: slot.pixelHeight, scale: slot.pixelScale}
    }
    return {w: this.#pixelWidth, h: this.#pixelHeight, scale: this.#pixelScale}
  }

  #applyDisplayTransform(slot = this.#displaySlots.get(this.#surfaceDisplayId)): void {
    if (slot === undefined) return
    slot.display.position.copy(slot.centerMm)
    slot.display.rotation.x = Math.PI / 2
    slot.display.updateMatrix()
  }

  // ────────────────────────── Input routing ──────────────────────────

  #attachInputListeners(): void {
    this.canvas.addEventListener("wheel", this.#handleWheel, {passive: false})
    this.canvas.addEventListener("mousemove", this.#handleMouseMove)
    this.canvas.addEventListener("mousedown", this.#handleMouseDown)
    this.canvas.addEventListener("click", this.#handleClick, true)
    this.canvas.addEventListener("touchstart", this.#handleTouchStart, {capture: true, passive: false})
    window.addEventListener("touchmove", this.#handleTouchMove, {capture: true, passive: false})
    window.addEventListener("touchend", this.#handleTouchEnd, {capture: true, passive: false})
    window.addEventListener("touchcancel", this.#handleTouchCancel, {capture: true, passive: false})
    this.canvas.addEventListener("contextmenu", this.#handleContextMenu)
    this.canvas.addEventListener("keydown", this.#handleKey)
    window.addEventListener("keydown", this.#handleWindowKey)
    window.addEventListener("blur", this.#handleWindowBlur)
    document.addEventListener("visibilitychange", this.#handleVisibilityChange)
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

  #surfaceAt(
    localX: number,
    localY: number,
    target?: SurfaceSlot["target"],
    displayId?: UiDisplayId,
  ): SurfaceSlot | undefined {
    // Reverse iteration — верхний zIndex перекрывает нижний; order сохраняет старую семантику.
    for (let i = this.#surfaces.length - 1; i >= 0; i--) {
      const slot = this.#surfaces[i]!
      if (target !== undefined && slot.target !== target) continue
      if (target === "display" && displayId !== undefined && slot.displayId !== displayId) continue
      if (slot.surface.acceptsPointerEvents?.() === false) continue
      const r = slot.rect
      if (slot.surface.node.visible === false || r.visible === false || r.w <= 0 || r.h <= 0) continue
      if (localX < r.x || localX > r.x + r.w || localY < r.y || localY > r.y + r.h) continue
      if (slot.surface.containsPointer?.(localX - r.x, localY - r.y) === false) continue
      return slot
    }
    return undefined
  }

  #localCoords(event: MouseEvent | WheelEvent): {x: number; y: number} {
    const rect = this.canvas.getBoundingClientRect()
    return {x: event.clientX - rect.left, y: event.clientY - rect.top}
  }

  #localCoordsFromTouch(touch: Touch): {x: number; y: number} {
    const rect = this.canvas.getBoundingClientRect()
    return {x: touch.clientX - rect.left, y: touch.clientY - rect.top}
  }

  #clientToCanvasCoords(clientX: number, clientY: number): {x: number; y: number} {
    const rect = this.canvas.getBoundingClientRect()
    return {x: clientX - rect.left, y: clientY - rect.top}
  }

  #mouseEventFromTouch(type: "mousedown" | "mousemove" | "mouseup", touch: Touch): MouseEvent {
    const init: MouseEventInit & PointerEventInit = {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === "mouseup" ? 0 : 1,
      clientX: touch.clientX,
      clientY: touch.clientY,
      screenX: touch.screenX,
      screenY: touch.screenY,
      pointerType: "touch",
      pointerId: touch.identifier,
      isPrimary: true,
    }
    const event = typeof PointerEvent === "function" ? new PointerEvent(type, init) : new MouseEvent(type, init)
    Object.defineProperty(event, "metaforPointerType", {value: "touch"})
    return event
  }

  #changedTouch(event: TouchEvent): Touch | null {
    if (this.#activeTouchId === null) return event.changedTouches[0] ?? null
    for (const touch of event.changedTouches) {
      if (touch.identifier === this.#activeTouchId) return touch
    }
    return null
  }

  #claimPointerEvent(event: MouseEvent | WheelEvent | TouchEvent): void {
    event.stopImmediatePropagation()
  }

  #rememberTouchEvent(): void {
    this.#lastTouchEventAt = Date.now()
  }

  #isCompatibilityMouseEvent(event: MouseEvent): boolean {
    const source = (event as MouseEvent & {sourceCapabilities?: {firesTouchEvents?: boolean} | null}).sourceCapabilities
    if (source?.firesTouchEvents === true) return true
    return this.#lastTouchEventAt > 0 && Date.now() - this.#lastTouchEventAt < 900
  }

  #displayCoords(canvasX: number, canvasY: number, requireInside = true, displayId?: UiDisplayId): DisplayCoords | null {
    if (!this.#displaySpaceEnabled) return {displayId: this.#surfaceDisplayId, x: canvasX, y: canvasY}
    const hit = this.#displayRayHit(canvasX, canvasY, requireInside, displayId)
    if (hit === null) return null
    const slot = this.#displaySlots.get(hit.displayId)
    if (slot === undefined) return null
    const x = hit.point.x / slot.pixelScale + slot.pixelWidth / 2
    const y = slot.pixelHeight / 2 - hit.point.y / slot.pixelScale
    if (
      requireInside &&
      (x < 0 || y < 0 || x > slot.pixelWidth || y > slot.pixelHeight)
    ) {
      return null
    }
    return {displayId: hit.displayId, x, y}
  }

  #onWheel(event: WheelEvent): void {
    const canvasCoords = this.#localCoords(event)
    const hudSlot = this.#surfaceAt(canvasCoords.x, canvasCoords.y, "hud")
    if (hudSlot !== undefined) {
      event.preventDefault()
      hudSlot.surface.onWheel?.(event, canvasCoords.x - hudSlot.rect.x, canvasCoords.y - hudSlot.rect.y)
      return
    }
    const displayCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y)
    const slot = displayCoords === null
      ? undefined
      : this.#surfaceAt(displayCoords.x, displayCoords.y, "display", displayCoords.displayId)
    if (displayCoords === null || slot === undefined) {
      if (this.#isDisplayNavigationMode()) {
        event.preventDefault()
        if (event.ctrlKey) this.#zoomDisplay(-wheelZoomDeltaPx(event), displayCoords?.displayId ?? null, canvasCoords)
        else this.#panView(event.deltaX, event.deltaY)
      }
      return
    }
    event.preventDefault()
    slot.surface.onWheel?.(event, displayCoords.x - slot.rect.x, displayCoords.y - slot.rect.y)
  }

  #onMouseMove(event: MouseEvent): void {
    if (this.#isCompatibilityMouseEvent(event)) {
      event.preventDefault()
      this.#claimPointerEvent(event)
      return
    }
    if (this.#displayDragActive !== null) {
      this.#updateDisplayDrag(event)
      return
    }

    if (this.#displayDragCandidate !== null) {
      this.#displayDragCandidate.clientX = event.clientX
      this.#displayDragCandidate.clientY = event.clientY
      const dx = event.clientX - this.#displayDragCandidate.startClientX
      const dy = event.clientY - this.#displayDragCandidate.startClientY
      if (dx * dx + dy * dy > 36) this.#cancelDisplayDragCandidate()
    }

    if (this.#displayNavigationActive) {
      event.preventDefault()
      this.#setDisplayHoverActive(true, this.#displayNavigationDisplayId)
      const deltaX = event.clientX - this.#displayNavigationLastX
      const deltaY = event.clientY - this.#displayNavigationLastY
      this.#displayNavigationLastX = event.clientX
      this.#displayNavigationLastY = event.clientY
      this.#orbitDisplay(deltaX, deltaY)
      return
    }

    const canvasCoords = this.#localCoords(event)
    if (this.#pressedSlot?.target === "hud") {
      this.#pressedSlot.surface.onPointerMove?.(event, canvasCoords.x - this.#pressedSlot.rect.x, canvasCoords.y - this.#pressedSlot.rect.y)
      return
    }
    const hudSlot = this.#surfaceAt(canvasCoords.x, canvasCoords.y, "hud")
    if (hudSlot !== undefined) {
      this.#setDisplayHoverActive(false)
      if (hudSlot !== this.#hoveredSlot) {
        this.#hoveredSlot?.surface.onPointerLeave?.()
        this.#hoveredSlot = hudSlot
      }
      hudSlot.surface.onPointerMove?.(event, canvasCoords.x - hudSlot.rect.x, canvasCoords.y - hudSlot.rect.y)
      return
    }
    const displayCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y)
    if (displayCoords === null) {
      this.#setDisplayHoverActive(false)
      this.canvas.style.cursor = "default"
      this.#hoveredSlot?.surface.onPointerLeave?.()
      this.#hoveredSlot = null
      return
    }
    this.#setDisplayHoverActive(true, displayCoords.displayId)
    const slot = this.#surfaceAt(displayCoords.x, displayCoords.y, "display", displayCoords.displayId)
    if (this.#pressedSlot !== null && this.#pressedSlot !== undefined) {
      const dragCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y, false, this.#pressedSlot.displayId) ?? displayCoords
      this.#pressedSlot.surface.onPointerMove?.(event, dragCoords.x - this.#pressedSlot.rect.x, dragCoords.y - this.#pressedSlot.rect.y)
      return
    }
    if (slot !== this.#hoveredSlot) {
      this.#hoveredSlot?.surface.onPointerLeave?.()
      this.#hoveredSlot = slot ?? null
    }
    if (slot === undefined) {
      this.canvas.style.cursor = this.#isDisplayNavigationMode() ? "grab" : "default"
      return
    }
    // Focus НЕ меняем по hover — иначе текстовый редактор теряет keydown
    // как только мышь уезжает на DOM-iframe или в зазор между surfaces.
    // Активная surface переключается ТОЛЬКО mousedown'ом.
    slot.surface.onPointerMove?.(event, displayCoords.x - slot.rect.x, displayCoords.y - slot.rect.y)
  }

  #onMouseDown(event: MouseEvent): void {
    if (this.#isCompatibilityMouseEvent(event)) {
      event.preventDefault()
      this.#claimPointerEvent(event)
      this.#claimNextClick = true
      return
    }
    this.#cancelDisplayDragCandidate()
    const canvasCoords = this.#localCoords(event)
    const hudSlot = this.#surfaceAt(canvasCoords.x, canvasCoords.y, "hud")
    if (hudSlot !== undefined) {
      if (this.inputProxy !== null) {
        event.preventDefault()
      } else {
        this.canvas.focus()
      }
      this.#positionInputProxy(event.clientX, event.clientY)
      this.setFocused(hudSlot.surface)
      this.#pressedSlot = hudSlot
      hudSlot.surface.onPointerDown?.(event, canvasCoords.x - hudSlot.rect.x, canvasCoords.y - hudSlot.rect.y)
      this.#focusInputProxyForUserSurface(hudSlot.surface, event)
      return
    }
    const displayCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y)
    const slot = displayCoords === null
      ? undefined
      : this.#surfaceAt(displayCoords.x, displayCoords.y, "display", displayCoords.displayId)
    if (displayCoords === null || slot === undefined) {
      this.#clearKeyboardFocus()
      if (this.#isDisplayNavigationMode() && event.button === 0) {
        event.preventDefault()
        this.#hoveredSlot?.surface.onPointerLeave?.()
        this.#hoveredSlot = null
        this.#beginDisplayNavigation(event, displayCoords?.displayId ?? this.#displayHoverDisplayId)
      }
      return
    }

    // Не даём браузеру передвинуть фокус по умолчанию: VirtualInput
    // должен остаться сфокусированным, чтобы macOS показывал ему
    // инструменты ввода.
    if (this.inputProxy !== null) {
      event.preventDefault()
    } else {
      this.canvas.focus()
    }
    // Позиционируем 1×1 textarea около курсора, чтобы всплывающие окна
    // macOS появлялись рядом, а не в углу страницы.
    this.#positionInputProxy(event.clientX, event.clientY)
    if (slot.displayId !== undefined && this.#activeDisplayId !== slot.displayId) {
      this.#activeDisplayId = slot.displayId
      this.#emitViewPointChange()
    }
    this.setFocused(slot.surface)
    this.#pressedSlot = slot
    if (displayCoords.displayId !== this.#surfaceDisplayId) this.#armDisplayDragCandidate(event, displayCoords.displayId)
    slot.surface.onPointerDown?.(event, displayCoords.x - slot.rect.x, displayCoords.y - slot.rect.y)
    this.#focusInputProxyForUserSurface(slot.surface, event)
  }

  #focusInputProxyForUserSurface(surface: UiSurfaceNode, event: MouseEvent): void {
    if (this.inputProxy === null || event.button !== 0) return
    this.inputProxy.focus({softKeyboard: softKeyboardInputModeForSurface(surface) === "text"})
  }

  #onContextMenu(event: MouseEvent): void {
    const canvasCoords = this.#localCoords(event)
    const hudSlot = this.#surfaceAt(canvasCoords.x, canvasCoords.y, "hud")
    if (hudSlot !== undefined) {
      event.preventDefault()
      hudSlot.surface.onContextMenu?.(event, canvasCoords.x - hudSlot.rect.x, canvasCoords.y - hudSlot.rect.y)
      return
    }
    const displayCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y)
    event.preventDefault()
    if (displayCoords === null) return
    const slot = this.#surfaceAt(displayCoords.x, displayCoords.y, "display", displayCoords.displayId)
    if (slot === undefined) return
    slot.surface.onContextMenu?.(event, displayCoords.x - slot.rect.x, displayCoords.y - slot.rect.y)
  }

  #positionInputProxy(clientX: number, clientY: number): void {
    if (this.inputProxy === null) return
    this.inputProxy.setCaretViewport(clientX, clientY)
  }

  #onMouseUp(event: MouseEvent): void {
    if (this.#isCompatibilityMouseEvent(event)) {
      event.preventDefault()
      this.#claimPointerEvent(event)
      return
    }
    this.#cancelDisplayDragCandidate()
    if (this.#displayDragActive !== null) {
      this.#endDisplayDrag()
      return
    }
    if (this.#displayNavigationActive) {
      this.#endDisplayNavigation()
      return
    }
    const slot = this.#pressedSlot
    this.#pressedSlot = null
    if (slot === undefined || slot === null) return
    const canvasCoords = this.#localCoords(event)
    if (slot.target === "hud") {
      slot.surface.onPointerUp?.(event, canvasCoords.x - slot.rect.x, canvasCoords.y - slot.rect.y)
      return
    }
    const displayCoords = this.#displayCoords(canvasCoords.x, canvasCoords.y, false, slot.displayId)
    if (displayCoords === null) return
    slot.surface.onPointerUp?.(event, displayCoords.x - slot.rect.x, displayCoords.y - slot.rect.y)
  }

  #onClick(event: MouseEvent): void {
    if (!this.#claimNextClick && !this.#isCompatibilityMouseEvent(event)) return
    this.#claimNextClick = false
    event.preventDefault()
    this.#claimPointerEvent(event)
  }

  #beginSurfaceTouch(event: TouchEvent, touch: Touch, slot: SurfaceSlot, localX: number, localY: number): void {
    this.#rememberTouchEvent()
    const preserveNativeActivation = slot.surface.preserveNativeTouchActivation?.() === true
    if (!preserveNativeActivation) event.preventDefault()
    this.#claimPointerEvent(event)
    this.#claimNextClick = true
    this.#cancelDisplayDragCandidate()
    this.#cancelDisplayTouchGesture()
    this.#setDisplayHoverActive(false)
    this.#positionInputProxy(touch.clientX, touch.clientY)
    if (slot.displayId !== undefined && this.#activeDisplayId !== slot.displayId) {
      this.#activeDisplayId = slot.displayId
      this.#emitViewPointChange()
    }
    this.setFocused(slot.surface)
    this.#pressedSlot = slot
    this.#activeTouchId = touch.identifier
    const mouseEvent = this.#mouseEventFromTouch("mousedown", touch)
    slot.surface.onPointerDown?.(mouseEvent, localX, localY)
    if (!preserveNativeActivation) this.#focusInputProxyForUserSurface(slot.surface, mouseEvent)
  }

  #beginDisplayTouchNavigation(event: TouchEvent, touch: Touch, displayId: UiDisplayId | null): void {
    this.#rememberTouchEvent()
    event.preventDefault()
    this.#claimPointerEvent(event)
    this.#claimNextClick = true
    this.#cancelDisplayDragCandidate()
    this.#cancelDisplayTouchGesture()
    this.#clearKeyboardFocus()
    this.#activeTouchId = touch.identifier
    const navigationEvent = this.#mouseEventFromTouch("mousedown", touch)
    this.#beginDisplayNavigation(navigationEvent, displayId)
    this.#setDisplayHoverActive(displayId !== null, displayId)
    const gesture: DisplayTouchGesture = {
      displayId,
      startClientX: touch.clientX,
      startClientY: touch.clientY,
      timer: null,
      longPressFired: false,
    }
    if (displayId !== null) {
      gesture.timer = window.setTimeout(() => this.#fireDisplayTouchLongPress(gesture), TOUCH_DISPLAY_LONG_PRESS_MS)
    }
    this.#displayTouchGesture = gesture
  }

  #fireDisplayTouchLongPress(gesture: DisplayTouchGesture): void {
    if (this.#displayTouchGesture !== gesture || gesture.displayId === null || this.#displayMode !== "far") return
    gesture.longPressFired = true
    if (gesture.timer !== null) {
      window.clearTimeout(gesture.timer)
      gesture.timer = null
    }
    this.#setDisplayHoverActive(true, gesture.displayId)
    this.#onDisplayLongPress?.({displayId: gesture.displayId})
  }

  #cancelDisplayTouchGesture(): void {
    const gesture = this.#displayTouchGesture
    if (gesture?.timer !== null && gesture?.timer !== undefined) window.clearTimeout(gesture.timer)
    this.#displayTouchGesture = null
  }

  #onTouchStart(event: TouchEvent): void {
    if (this.#activeTouchId !== null || event.changedTouches.length === 0) return
    const touch = event.changedTouches[0]!
    const local = this.#localCoordsFromTouch(touch)
    const hudSlot = this.#surfaceAt(local.x, local.y, "hud")
    if (hudSlot !== undefined) {
      this.#beginSurfaceTouch(event, touch, hudSlot, local.x - hudSlot.rect.x, local.y - hudSlot.rect.y)
      return
    }

    const displayCoords = this.#displayCoords(local.x, local.y)
    const displaySlot = displayCoords === null
      ? undefined
      : this.#surfaceAt(displayCoords.x, displayCoords.y, "display", displayCoords.displayId)
    if (!this.#isDisplayNavigationMode() && displayCoords !== null && displaySlot !== undefined) {
      this.#beginSurfaceTouch(event, touch, displaySlot, displayCoords.x - displaySlot.rect.x, displayCoords.y - displaySlot.rect.y)
      return
    }

    if (!this.#isDisplayNavigationMode()) return
    this.#beginDisplayTouchNavigation(event, touch, displayCoords?.displayId ?? this.#displayHoverDisplayId)
  }

  #onTouchMove(event: TouchEvent): void {
    if (this.#activeTouchId === null) return
    this.#rememberTouchEvent()
    const touch = this.#changedTouch(event)
    const gesture = this.#displayTouchGesture
    if (gesture !== null) {
      if (touch === null) return
      event.preventDefault()
      this.#claimPointerEvent(event)
      const dx = touch.clientX - gesture.startClientX
      const dy = touch.clientY - gesture.startClientY
      if (!gesture.longPressFired && dx * dx + dy * dy > TOUCH_DISPLAY_LONG_PRESS_MOVE_PX * TOUCH_DISPLAY_LONG_PRESS_MOVE_PX) {
        if (gesture.timer !== null) {
          window.clearTimeout(gesture.timer)
          gesture.timer = null
        }
      }
      if (this.#displayNavigationActive) {
        this.#setDisplayHoverActive(gesture.displayId !== null, gesture.displayId)
        const deltaX = touch.clientX - this.#displayNavigationLastX
        const deltaY = touch.clientY - this.#displayNavigationLastY
        this.#displayNavigationLastX = touch.clientX
        this.#displayNavigationLastY = touch.clientY
        if (deltaX !== 0 || deltaY !== 0) this.#orbitDisplay(deltaX, deltaY)
      }
      return
    }
    const slot = this.#pressedSlot
    if (touch === null || slot === null) return
    event.preventDefault()
    this.#claimPointerEvent(event)
    const local = this.#localCoordsFromTouch(touch)
    slot.surface.onPointerMove?.(this.#mouseEventFromTouch("mousemove", touch), local.x - slot.rect.x, local.y - slot.rect.y)
  }

  #onTouchEnd(event: TouchEvent): void {
    if (this.#activeTouchId === null) return
    this.#rememberTouchEvent()
    const touch = this.#changedTouch(event)
    if (this.#displayTouchGesture !== null) {
      if (touch === null) return
      this.#cancelDisplayTouchGesture()
      this.#activeTouchId = null
      this.#claimPointerEvent(event)
      event.preventDefault()
      this.#endDisplayNavigation()
      return
    }
    const slot = this.#pressedSlot
    if (touch === null || slot === null) return
    this.#pressedSlot = null
    this.#activeTouchId = null
    this.#claimPointerEvent(event)
    const local = this.#localCoordsFromTouch(touch)
    slot.surface.onPointerUp?.(this.#mouseEventFromTouch("mouseup", touch), local.x - slot.rect.x, local.y - slot.rect.y)
    event.preventDefault()
  }

  #onTouchCancel(event: TouchEvent): void {
    if (this.#activeTouchId === null) return
    this.#rememberTouchEvent()
    const touch = this.#changedTouch(event)
    if (this.#displayTouchGesture !== null) {
      this.#cancelDisplayTouchGesture()
      this.#pressedSlot = null
      this.#activeTouchId = null
      this.#claimNextClick = false
      this.#endDisplayNavigation()
      if (touch !== null) {
        event.preventDefault()
        this.#claimPointerEvent(event)
      }
      return
    }
    const slot = this.#pressedSlot
    this.#pressedSlot = null
    this.#activeTouchId = null
    this.#claimNextClick = false
    if (slot === null) return
    event.preventDefault()
    this.#claimPointerEvent(event)
    const mouseEvent = touch === null
      ? new MouseEvent("mouseup", {bubbles: true, cancelable: true, button: 0, buttons: 0})
      : this.#mouseEventFromTouch("mouseup", touch)
    slot.surface.onPointerUp?.(mouseEvent, -1, -1)
  }

  #onMouseLeave(): void {
    this.#cancelDisplayDragCandidate()
    this.#cancelDisplayTouchGesture()
    // Не сбрасываем focus — пользователь может уйти мышью на toolbar/iframe
    // и продолжать набирать. Focus снимается только новым mousedown.
    this.#setDisplayHoverActive(false)
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

  #onWindowKey(event: KeyboardEvent): void {
    if (this.#focused === null || this.inputProxy?.isFocused() === true) return
    if (!isRuntimeKeyFallbackTarget(event.target, this.canvas)) return
    this.#onKey(event)
  }

  #onInputText(text: string): void {
    const focused = this.#focused
    if (focused === null) return
    focused.onInputText?.(text)
    insertActiveInputText(focused as UiSurfaceForInput, text)
  }
}

type UiSurfaceForInput = Parameters<typeof handleActiveInputKey>[0]

function softKeyboardInputModeForSurface(surface: UiSurfaceNode): VirtualInputSoftKeyboardMode {
  const explicit = surface.softKeyboardInputMode?.()
  if (explicit !== undefined) return explicit
  return surfaceHasActiveInput(surface as UiSurfaceForInput) ? "text" : "none"
}

function isRuntimeKeyFallbackTarget(target: EventTarget | null, canvas: HTMLCanvasElement): boolean {
  if (target === null || target === window || target === document || target === document.body || target === document.documentElement) {
    return true
  }
  if (target === canvas) return true
  if (!(target instanceof HTMLElement)) return false
  if (target.closest("textarea,input,select,[contenteditable='true']") !== null) return false
  return target === canvas.parentElement || target.contains(canvas)
}

function centerFromOutline(outline: UiDisplayHoverOutline): {x: number; y: number} {
  return {
    x: (outline.topLeft.x + outline.topRight.x + outline.bottomRight.x + outline.bottomLeft.x) / 4,
    y: (outline.topLeft.y + outline.topRight.y + outline.bottomRight.y + outline.bottomLeft.y) / 4,
  }
}

function rectFromOutline(outline: UiDisplayHoverOutline): {x: number; y: number; w: number; h: number} {
  const xs = [outline.topLeft.x, outline.topRight.x, outline.bottomRight.x, outline.bottomLeft.x]
  const ys = [outline.topLeft.y, outline.topRight.y, outline.bottomRight.y, outline.bottomLeft.y]
  const xMin = Math.min(...xs)
  const yMin = Math.min(...ys)
  const xMax = Math.max(...xs)
  const yMax = Math.max(...ys)
  return {x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin}
}

function vectorSnapshot(vector: Vector3): UiRuntimeViewPointVector {
  return {x: vector.x, y: vector.y, z: vector.z}
}

function vectorFromSnapshot(value: UiRuntimeViewPointVector): Vector3 | null {
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z)) return null
  return new Vector3(value.x, value.y, value.z)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function clampSurfaceRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const bw = Math.max(1, Math.floor(boundsW))
  const bh = Math.max(1, Math.floor(boundsH))
  const w = clampNumber(finiteOr(rect.w, 1), 1, bw)
  const h = clampNumber(finiteOr(rect.h, 1), 1, bh)
  const x = clampNumber(finiteOr(rect.x, 0), 0, Math.max(0, bw - w))
  const y = clampNumber(finiteOr(rect.y, 0), 0, Math.max(0, bh - h))
  const next: UiSurfaceRect = {x, y, w, h}
  if (rect.visible !== undefined) next.visible = rect.visible
  return next
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function wheelZoomDeltaPx(event: WheelEvent): number {
  const deltaY = wheelDeltaPx(event.deltaY, event.deltaMode, 800)
  if (Math.abs(deltaY) >= 0.01) return deltaY
  return wheelDeltaPx(event.deltaX, event.deltaMode, 800)
}

function wheelDeltaPx(delta: number, deltaMode: number, pageSizePx: number): number {
  if (!Number.isFinite(delta) || delta === 0) return 0
  if (deltaMode === 1) return delta * 40
  if (deltaMode === 2) return delta * pageSizePx
  return delta
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

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
