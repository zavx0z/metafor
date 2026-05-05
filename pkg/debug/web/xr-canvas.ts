/**
 * XrCanvas — единый WebGPU-канвас для всех debug-карточек.
 *
 * Один Renderer + один Scene + один ViewPoint. Каждая карточка регистрируется
 * как Object3D со своим pixel-rect (xPx, yPx, wPx, hPx) внутри canvas.
 *
 * Конвенция координат card.node (TL-anchor): origin node соответствует
 * top-left rect в world-coords. Дочерние Object3D card позиционируют как
 * `position.x = px_x * pixelScale`, `position.y = -px_y * pixelScale` (Y
 * растёт вниз в pixel, вверх в world). Это согласовано с XrOverlay/XrConsole
 * предыдущей версии.
 *
 * XrCanvas сам ловит wheel/key/mouse и направляет в card под курсором.
 * Render-on-demand: card.requestRender → XrCanvas сводит в один RAF.
 */

import {
  Color,
  Object3D,
  Renderer,
  Scene,
  TrueTypeFont,
  ViewPoint,
} from "@metafor/engine"

const FONT_URL = "/JetBrainsMono-Bold.ttf"

export type CardRect = {
  /** Pixel-координаты card'а внутри canvas. (0,0) = верх-лево canvas. */
  x: number
  y: number
  w: number
  h: number
}

export type CardLayoutFn = (canvas: {w: number; h: number}) => CardRect

export interface XrCard {
  /** Object3D, который XrCanvas позиционирует. node.origin = TL card-rect. */
  readonly node: Object3D
  /** Уведомление: rect (в pixel'ах canvas) изменился, pixelScale обновлён.
   *  Card перестраивает свой layout. */
  setRect(rect: CardRect, pixelScale: number, font: TrueTypeFont): void
  /** Вызывается один раз сразу после addCard, до setRect. */
  attachCanvas(canvas: XrCanvas): void
  onWheel?(event: WheelEvent, localX: number, localY: number): void
  onKey?(event: KeyboardEvent): void
  onActivate?(): void
  onDeactivate?(): void
  dispose?(): void
}

type CardSlot = {
  card: XrCard
  layout: CardLayoutFn
  rect: CardRect
}

export class XrCanvas {
  static async create(canvas: HTMLCanvasElement): Promise<XrCanvas> {
    const renderer = new Renderer()
    await renderer.init(canvas)
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    const font = await TrueTypeFont.fromUrl(FONT_URL)
    return new XrCanvas(canvas, renderer, font)
  }

  readonly canvas: HTMLCanvasElement
  readonly renderer: Renderer
  readonly scene: Scene
  readonly viewPoint: ViewPoint
  readonly font: TrueTypeFont
  readonly #cards: CardSlot[] = []
  #focused: XrCard | null = null
  #pixelWidth = 800
  #pixelHeight = 600
  #pixelScale = 0.001
  #cameraDistance = 0.6
  #disposed = false
  #renderRequested = false
  #rafId: number | null = null

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer, font: TrueTypeFont) {
    this.canvas = canvas
    this.renderer = renderer
    this.font = font
    this.scene = new Scene()
    this.scene.background = new Color(0, 0, 0, 0)
    this.viewPoint = new ViewPoint({
      element: canvas,
      fov: Math.PI / 4,
      near: 0.01,
      far: 50,
      position: {x: 0, y: 0, z: this.#cameraDistance},
      target: {x: 0, y: 0, z: 0},
    })
    const vp = this.viewPoint as unknown as {up: {set(x: number, y: number, z: number): void}}
    vp.up.set(0, 1, 0)
    this.viewPoint.update()
    this.viewPoint.dispose() // снимаем orbit-listeners — нам нужны только наши wheel/key

    this.#attachInputListeners()
  }

  /** Регистрируем card. layout-функция вызывается на каждом resize. */
  addCard(card: XrCard, layout: CardLayoutFn): void {
    card.attachCanvas(this)
    this.scene.add(card.node)
    const rect = layout({w: this.#pixelWidth, h: this.#pixelHeight})
    this.#cards.push({card, layout, rect})
    this.#applyLayout()
    this.requestRender()
  }

  #applyLayout(): void {
    for (const slot of this.#cards) {
      slot.rect = slot.layout({w: this.#pixelWidth, h: this.#pixelHeight})
      // node.position = world-coords TL rect.
      slot.card.node.position.x = (slot.rect.x - this.#pixelWidth / 2) * this.#pixelScale
      slot.card.node.position.y = (this.#pixelHeight / 2 - slot.rect.y) * this.#pixelScale
      slot.card.node.updateMatrix()
      slot.card.setRect(slot.rect, this.#pixelScale, this.font)
    }
  }

  handleResize(): void {
    if (this.#disposed) return
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (w < 2 || h < 2) return
    if (w === this.#pixelWidth && h === this.#pixelHeight) return

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

  setFocused(card: XrCard | null): void {
    if (this.#focused === card) return
    this.#focused?.onDeactivate?.()
    this.#focused = card
    card?.onActivate?.()
    this.requestRender()
  }

  dispose(): void {
    this.#disposed = true
    if (this.#rafId !== null) cancelAnimationFrame(this.#rafId)
    for (const slot of this.#cards) slot.card.dispose?.()
    this.#cards.length = 0
  }

  // --- Input routing ---
  #attachInputListeners(): void {
    this.canvas.addEventListener("wheel", (e) => this.#onWheel(e), {passive: false})
    this.canvas.addEventListener("mousemove", (e) => this.#onMouseMove(e))
    this.canvas.addEventListener("mousedown", (e) => this.#onMouseDown(e))
    this.canvas.addEventListener("keydown", (e) => this.#onKey(e))
    if (this.canvas.tabIndex < 0) this.canvas.tabIndex = 0
  }
  #cardAt(localX: number, localY: number): CardSlot | undefined {
    for (const slot of this.#cards) {
      const r = slot.rect
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
    if (slot !== undefined && slot.card !== this.#focused) this.setFocused(slot.card)
  }
  #onMouseDown(event: MouseEvent): void {
    const {x, y} = this.#localCoords(event)
    const slot = this.#cardAt(x, y)
    if (slot !== undefined) {
      this.canvas.focus()
      this.setFocused(slot.card)
    }
  }
  #onKey(event: KeyboardEvent): void {
    this.#focused?.onKey?.(event)
  }
}
