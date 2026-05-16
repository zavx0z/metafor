/**
 * UiCanvas — единый WebGPU-canvas для UI-карточек.
 *
 * Контракт:
 *  • Один Renderer + Scene + ViewPoint, perspective camera.
 *  • Карточки регистрируются как UiCard с layout-функцией pixel-rect от
 *    размеров canvas. На resize UiCanvas пересчитывает rect'ы и зовёт
 *    setRect у каждой карточки. card.node.origin = TL card-rect в world.
 *  • Координаты внутри node — pixel-coords от card-TL: x,y → ps-units в world.
 *  • Маршрутизация ввода: wheel/key/mouse → card под курсором.
 *  • Render-on-demand: card.requestRender → UiCanvas сводит в один RAF.
 */

import {Color, Object3D, Renderer, Scene, TrueTypeFont, ViewPoint} from "@metafor/engine"
import {VirtualInput} from "./virtual-input.ts"

export type CardRect = {x: number; y: number; w: number; h: number; visible?: boolean}
export type CardLayoutFn = (canvas: {w: number; h: number}) => CardRect

export interface UiCard {
  /** Object3D, который UiCanvas позиционирует. node.origin = TL card-rect. */
  readonly node: Object3D
  attachCanvas(canvas: UiCanvas): void
  setRect(rect: CardRect, pixelScale: number, font: TrueTypeFont): void
  onWheel?(event: WheelEvent, localX: number, localY: number): void
  onKey?(event: KeyboardEvent): void
  /**
   * Текстовый ввод, который пришёл НЕ через keydown: emoji-panel, IME-
   * композиция, dictation, autocorrect-replace. UiCanvas пробрасывает сюда
   * данные из `VirtualInput`. По умолчанию card может вызывать свой
   * insertText, как при paste.
   */
  onInputText?(text: string): void
  onPointerMove?(event: MouseEvent, localX: number, localY: number): void
  onPointerDown?(event: MouseEvent, localX: number, localY: number): void
  onPointerUp?(event: MouseEvent, localX: number, localY: number): void
  onActivate?(): void
  onDeactivate?(): void
  dispose?(): void
}

type CardSlot = {
  card: UiCard
  layout: CardLayoutFn
  rect: CardRect
}

export type UiCanvasOpts = {
  /** Путь к TTF-шрифту. По умолчанию '/JetBrainsMono-Bold.ttf'. */
  fontUrl?: string
  /** Camera distance (z). Меньше = ближе перспектива. Default 0.6. */
  cameraDistance?: number
  /** Field of view. Default π/4. */
  fov?: number
  /**
   * Создать VirtualInput — невидимый textarea, через который идут все
   * keydown'ы и текстовые вставки (emoji, IME, dictation, autocorrect).
   * Нужен, чтобы macOS показывал нативные инструменты ввода для canvas.
   * Default true для backward-совместимости — если фокус нужен на canvas,
   * передайте false.
   */
  inputProxy?: boolean
}

const DEFAULT_FONT_URL = "/JetBrainsMono-Bold.ttf"

export class UiCanvas {
  static async create(canvas: HTMLCanvasElement, opts: UiCanvasOpts = {}): Promise<UiCanvas> {
    const renderer = new Renderer()
    await renderer.init(canvas)
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    const font = await TrueTypeFont.fromUrl(opts.fontUrl ?? DEFAULT_FONT_URL)
    return new UiCanvas(canvas, renderer, font, opts)
  }

  readonly canvas: HTMLCanvasElement
  readonly renderer: Renderer
  readonly scene: Scene
  readonly viewPoint: ViewPoint
  readonly font: TrueTypeFont
  readonly inputProxy: VirtualInput | null
  readonly #cards: CardSlot[] = []
  #focused: UiCard | null = null
  #pixelWidth = 800
  #pixelHeight = 600
  #pixelScale = 0.001
  #sizeInitialized = false
  readonly #cameraDistance: number
  #disposed = false
  #renderRequested = false
  #rafId: number | null = null
  #pressedSlot: CardSlot | null = null
  readonly #handleWheel = (event: WheelEvent): void => this.#onWheel(event)
  readonly #handleMouseMove = (event: MouseEvent): void => this.#onMouseMove(event)
  readonly #handleMouseDown = (event: MouseEvent): void => this.#onMouseDown(event)
  readonly #handleMouseUp = (event: MouseEvent): void => this.#onMouseUp(event)
  readonly #handleMouseLeave = (): void => this.#onMouseLeave()
  readonly #handleKey = (event: KeyboardEvent): void => this.#onKey(event)

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer, font: TrueTypeFont, opts: UiCanvasOpts) {
    this.canvas = canvas
    this.renderer = renderer
    this.font = font
    this.#cameraDistance = opts.cameraDistance ?? 0.6
    this.scene = new Scene()
    this.scene.background = new Color(0, 0, 0, 0)
    this.viewPoint = new ViewPoint({
      element: canvas,
      fov: opts.fov ?? Math.PI / 4,
      near: 0.01,
      far: 50,
      position: {x: 0, y: 0, z: this.#cameraDistance},
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
      this.inputProxy.onKey((e) => this.#focused?.onKey?.(e))
      this.inputProxy.onText((t) => this.#focused?.onInputText?.(t))
    } else {
      this.inputProxy = null
    }

    this.#attachInputListeners()
  }

  /** Регистрирует card. layout-функция вызывается на каждом resize. */
  addCard(card: UiCard, layout: CardLayoutFn): void {
    card.attachCanvas(this)
    this.scene.add(card.node)
    const rect = layout({w: this.#pixelWidth, h: this.#pixelHeight})
    this.#cards.push({card, layout, rect})
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
    const physicalHeight = 2 * this.#cameraDistance * Math.tan(this.viewPoint.fov / 2)
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
      this.scene.updateWorldMatrix()
      this.renderer.render(this.scene, this.viewPoint)
    })
  }

  setFocused(card: UiCard | null): void {
    if (this.#focused === card) return
    this.#focused?.onDeactivate?.()
    this.#focused = card
    card?.onActivate?.()
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
    window.removeEventListener("mouseup", this.#handleMouseUp)
    this.setFocused(null)
    this.#pressedSlot = null
    this.inputProxy?.dispose()
    for (const slot of this.#cards) slot.card.dispose?.()
    this.#cards.length = 0
  }

  // ────────────────────────── Internal layout ──────────────────────────

  #applyLayout(): void {
    for (const slot of this.#cards) {
      slot.rect = slot.layout({w: this.#pixelWidth, h: this.#pixelHeight})
      const visible = slot.rect.visible !== false && slot.rect.w > 0 && slot.rect.h > 0
      slot.card.node.visible = visible
      if (!visible) continue
      slot.card.node.position.x = (slot.rect.x - this.#pixelWidth / 2) * this.#pixelScale
      slot.card.node.position.y = (this.#pixelHeight / 2 - slot.rect.y) * this.#pixelScale
      slot.card.node.updateMatrix()
      slot.card.setRect(slot.rect, this.#pixelScale, this.font)
    }
  }

  // ────────────────────────── Input routing ──────────────────────────

  #attachInputListeners(): void {
    this.canvas.addEventListener("wheel", this.#handleWheel, {passive: false})
    this.canvas.addEventListener("mousemove", this.#handleMouseMove)
    this.canvas.addEventListener("mousedown", this.#handleMouseDown)
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

  #cardAt(localX: number, localY: number): CardSlot | undefined {
    // Reverse iteration — последняя добавленная card перекрывает предыдущие.
    for (let i = this.#cards.length - 1; i >= 0; i--) {
      const slot = this.#cards[i]!
      const r = slot.rect
      if (slot.card.node.visible === false || r.visible === false || r.w <= 0 || r.h <= 0) continue
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
    const slot = this.#cardAt(x, y)
    if (slot === undefined) return
    event.preventDefault()
    slot.card.onWheel?.(event, x - slot.rect.x, y - slot.rect.y)
  }

  #onMouseMove(event: MouseEvent): void {
    const {x, y} = this.#localCoords(event)
    const slot = this.#cardAt(x, y)
    if (slot === undefined) {
      this.canvas.style.cursor = "default"
      return
    }
    // Focus НЕ меняем по hover — иначе текстовый редактор теряет keydown
    // как только мышь уезжает на DOM-iframe или в зазор между карточками.
    // Активная карточка переключается ТОЛЬКО mousedown'ом.
    slot.card.onPointerMove?.(event, x - slot.rect.x, y - slot.rect.y)
  }

  #onMouseDown(event: MouseEvent): void {
    const {x, y} = this.#localCoords(event)
    const slot = this.#cardAt(x, y)
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
      this.setFocused(slot.card)
      this.#pressedSlot = slot
      slot.card.onPointerDown?.(event, x - slot.rect.x, y - slot.rect.y)
    }
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
    slot.card.onPointerUp?.(event, x - slot.rect.x, y - slot.rect.y)
  }

  #onMouseLeave(): void {
    // Не сбрасываем focus — пользователь может уйти мышью на toolbar/iframe
    // и продолжать набирать. Focus снимается только новым mousedown.
    this.canvas.style.cursor = "default"
  }

  #onKey(event: KeyboardEvent): void {
    this.#focused?.onKey?.(event)
  }
}
