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

import {Color, Object3D, Renderer, Space, TrueTypeFont, ViewPoint} from "@metafor/engine"
import {HUD} from "./targets/HUD.ts"
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
    this.space = new Space()
    this.space.background = new Color(0, 0, 0, 0)
    this.hud = new HUD({distanceMm: this.#cameraDistanceMm})
    this.viewPoint = new ViewPoint({
      element: canvas,
      fov: opts.fov ?? Math.PI / 4,
      near: 1,
      far: 5000,
      position: {x: 0, y: 0, z: this.#cameraDistanceMm},
      target: {x: 0, y: 0, z: 0},
    })
    const vp = this.viewPoint as unknown as {up: {set(x: number, y: number, z: number): void}}
    vp.up.set(0, 1, 0)
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
    this.space.add(surface.node)
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
    if (this.#focused === surface) return
    this.#focused?.onDeactivate?.()
    this.#focused = surface
    surface?.onActivate?.()
    this.requestRender()
  }

  dispose(): void {
    this.#disposed = true
    if (this.#rafId !== null) cancelAnimationFrame(this.#rafId)
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
    this.inputProxy?.dispose()
    for (const slot of this.#surfaces) slot.surface.dispose?.()
    this.#surfaces.length = 0
  }

  // ────────────────────────── Internal layout ──────────────────────────

  #applyLayout(): void {
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

  #onWheel(event: WheelEvent): void {
    const {x, y} = this.#localCoords(event)
    const slot = this.#surfaceAt(x, y)
    if (slot === undefined) return
    event.preventDefault()
    slot.surface.onWheel?.(event, x - slot.rect.x, y - slot.rect.y)
  }

  #onMouseMove(event: MouseEvent): void {
    const {x, y} = this.#localCoords(event)
    const slot = this.#surfaceAt(x, y)
    if (this.#pressedSlot !== null && this.#pressedSlot !== undefined) {
      this.#pressedSlot.surface.onPointerMove?.(event, x - this.#pressedSlot.rect.x, y - this.#pressedSlot.rect.y)
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
    slot.surface.onPointerMove?.(event, x - slot.rect.x, y - slot.rect.y)
  }

  #onMouseDown(event: MouseEvent): void {
    const {x, y} = this.#localCoords(event)
    const slot = this.#surfaceAt(x, y)
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
      slot.surface.onPointerDown?.(event, x - slot.rect.x, y - slot.rect.y)
    }
  }

  #onContextMenu(event: MouseEvent): void {
    const {x, y} = this.#localCoords(event)
    const slot = this.#surfaceAt(x, y)
    event.preventDefault()
    if (slot === undefined) return
    slot.surface.onContextMenu?.(event, x - slot.rect.x, y - slot.rect.y)
  }

  #positionInputProxy(clientX: number, clientY: number): void {
    if (this.inputProxy === null) return
    this.inputProxy.setCaretViewport(clientX, clientY)
  }

  #onMouseUp(event: MouseEvent): void {
    const slot = this.#pressedSlot
    this.#pressedSlot = null
    if (slot === undefined || slot === null) return
    const {x, y} = this.#localCoords(event)
    slot.surface.onPointerUp?.(event, x - slot.rect.x, y - slot.rect.y)
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
