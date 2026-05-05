/**
 * Engine-консоль: append-only лог из debug-target stdout/stderr и Console.* API.
 *
 * Канвас живёт внутри #console-section на месте старого <pre id="console-log">.
 * Каждая входящая запись добавляется как отдельный Text-объект (с цветом по
 * level: info/warn/error). Ring-buffer ограничивает число строк в памяти.
 *
 * Отдельный WebGPU-контекст (свой Renderer/Scene/ViewPoint) — пока удобнее,
 * чем разделять с xr-overlay. Финальный ход — единый canvas/Renderer на всю
 * grid (см. план #11), сейчас задача №1: убрать HTML-pre чтобы консоль тоже
 * шла через движок.
 *
 * Render-on-demand: один кадр после pushEntries / handleResize / scroll.
 */

import {
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Renderer,
  Scene,
  Text,
  TextMaterial,
  TrueTypeFont,
  ViewPoint,
} from "@metafor/engine"

export type XrConsoleEntry = {
  ts: string
  level?: string | undefined
  text: string
}

const FONT_URL = "/JetBrainsMono-Bold.ttf"
const LINE_PX = 16
const FONT_PX = 11
const TS_FONT_PX = 9
const PAD_TOP_PX = 28
const PAD_LEFT_PX = 12
const PAD_RIGHT_PX = 8
const PAD_BOTTOM_PX = 6
const TS_GUTTER_PX = 70 // ширина колонки timestamp

const COLOR_BG = new Color(22 / 255, 27 / 255, 34 / 255, 0)
const COLOR_TS = new Color(110 / 255, 118 / 255, 129 / 255, 0.85)
const COLOR_TEXT = new Color(225 / 255, 228 / 255, 233 / 255, 1)
const COLOR_WARN = new Color(210 / 255, 153 / 255, 34 / 255, 1)
const COLOR_ERROR = new Color(247 / 255, 129 / 255, 102 / 255, 1)
const COLOR_DEBUG = new Color(139 / 255, 148 / 255, 158 / 255, 1)

// Ring-buffer: максимум N строк в памяти, при переполнении старые
// выкидываются вместе с GPU-буферами (через invalidateGeometry).
const MAX_ENTRIES = 1000
const AUTOSCROLL_TOLERANCE_PX = 20

type RenderedEntry = {
  ts: Text
  body: Text
  data: XrConsoleEntry
}

export class XrConsole {
  static async create(canvas: HTMLCanvasElement): Promise<XrConsole> {
    const renderer = new Renderer()
    await renderer.init(canvas)
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    const font = await TrueTypeFont.fromUrl(FONT_URL)
    return new XrConsole(canvas, renderer, font)
  }

  readonly #canvas: HTMLCanvasElement
  readonly #renderer: Renderer
  readonly #font: TrueTypeFont
  readonly #scene: Scene
  readonly #viewPoint: ViewPoint
  readonly #card: Object3D
  readonly #background: Mesh
  readonly #logContainer: Object3D
  readonly #tsMaterial: TextMaterial
  readonly #infoMaterial: TextMaterial
  readonly #warnMaterial: TextMaterial
  readonly #errorMaterial: TextMaterial
  readonly #debugMaterial: TextMaterial

  #physicalHeight = 0.4
  #physicalWidth = 0.8
  #pixelWidth = 800
  #pixelHeight = 200
  #contentPixelWidth = 780
  #contentPixelHeight = 160
  #pixelScale = 0.001
  #cameraDistance = 0.6
  #disposed = false
  #renderRequested = false
  #rafId: number | null = null
  #wheelHandler: ((event: WheelEvent) => void) | null = null
  #scrollOffset = 0 // pixel offset с верха (всегда >= 0)
  #scrollAccum = 0
  #entries: RenderedEntry[] = []

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer, font: TrueTypeFont) {
    this.#canvas = canvas
    this.#renderer = renderer
    this.#font = font

    this.#scene = new Scene()
    this.#scene.background = new Color(0, 0, 0, 0)

    this.#viewPoint = new ViewPoint({
      element: canvas,
      fov: Math.PI / 4,
      near: 0.01,
      far: 50,
      position: {x: 0, y: 0, z: this.#cameraDistance},
      target: {x: 0, y: 0, z: 0},
    })
    this.#setCameraUpY()
    this.#viewPoint.dispose() // снимаем orbit-listeners

    this.#card = new Object3D()
    this.#scene.add(this.#card)

    this.#background = new Mesh(
      new PlaneGeometry({width: 1, height: 1}),
      new MeshBasicMaterial({color: COLOR_BG}),
    )
    this.#background.position.z = -0.02
    this.#card.add(this.#background)

    this.#logContainer = new Object3D()
    this.#logContainer.position.z = 0.001
    this.#card.add(this.#logContainer)

    this.#tsMaterial = new TextMaterial({color: COLOR_TS})
    this.#infoMaterial = new TextMaterial({color: COLOR_TEXT})
    this.#warnMaterial = new TextMaterial({color: COLOR_WARN})
    this.#errorMaterial = new TextMaterial({color: COLOR_ERROR})
    this.#debugMaterial = new TextMaterial({color: COLOR_DEBUG})
  }

  #setCameraUpY(): void {
    const vp = this.#viewPoint as unknown as {up: {set(x: number, y: number, z: number): void}}
    vp.up.set(0, 1, 0)
    this.#viewPoint.update()
  }

  start(): void {
    if (this.#disposed) return
    this.#attachWheelListener()
    this.handleResize()
  }

  dispose(): void {
    this.#disposed = true
    if (this.#rafId !== null) cancelAnimationFrame(this.#rafId)
    this.#detachWheelListener()
  }

  handleResize(): void {
    const rect = this.#canvas.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (w < 2 || h < 2) return
    if (w === this.#pixelWidth && h === this.#pixelHeight) return

    this.#renderer.setSize(w, h)
    this.#viewPoint.setAspectRatio(w / h)

    this.#pixelWidth = w
    this.#pixelHeight = h
    this.#physicalHeight = 2 * this.#cameraDistance * Math.tan(this.#viewPoint.fov / 2)
    this.#physicalWidth = this.#physicalHeight * (w / h)
    this.#pixelScale = this.#physicalHeight / this.#pixelHeight

    this.#background.geometry = new PlaneGeometry({
      width: this.#physicalWidth,
      height: this.#physicalHeight,
    })

    this.#contentPixelWidth = Math.max(1, this.#pixelWidth - PAD_LEFT_PX - PAD_RIGHT_PX)
    this.#contentPixelHeight = Math.max(1, this.#pixelHeight - PAD_TOP_PX - PAD_BOTTOM_PX)

    // Сдвиг к верху-левому, отступ под h2 ≈ PAD_TOP_PX.
    this.#card.position.x = -this.#physicalWidth / 2 + PAD_LEFT_PX * this.#pixelScale
    this.#card.position.y = this.#physicalHeight / 2 - PAD_TOP_PX * this.#pixelScale
    this.#card.updateMatrix()

    this.#applyScroll()
    this.#requestRender()
  }

  /**
   * Добавляет одну или несколько записей. Если scroll был "у дна" — после
   * добавления автоскроллим к новому низу (как в обычной консоли).
   */
  pushEntries(entries: XrConsoleEntry[]): void {
    if (entries.length === 0) return
    const wasAtBottom = this.#isAtBottom()

    for (const entry of entries) {
      this.#appendEntry(entry)
    }
    // Trim ring-buffer до MAX_ENTRIES.
    while (this.#entries.length > MAX_ENTRIES) {
      const oldest = this.#entries.shift()
      if (oldest === undefined) break
      this.#disposeEntry(oldest)
    }

    if (wasAtBottom) this.#scrollToBottom()
    this.#applyScroll()
    this.#requestRender()
  }

  clear(): void {
    for (const entry of this.#entries) this.#disposeEntry(entry)
    this.#entries = []
    this.#scrollOffset = 0
    this.#applyScroll()
    this.#requestRender()
  }

  #appendEntry(entry: XrConsoleEntry): void {
    const tsFontWorld = TS_FONT_PX * this.#pixelScale
    const fontWorld = FONT_PX * this.#pixelScale

    const tsText = formatTimestamp(entry.ts)
    const ts = new Text(tsText, this.#font, tsFontWorld, this.#tsMaterial)
    ts.name = "ts"

    const material = this.#materialForLevel(entry.level)
    // Хвост обрезаем на 4096 символов чтобы один поток не вешал рендер.
    const text = entry.text.length > 4096 ? `${entry.text.slice(0, 4096)}…` : entry.text
    const body = new Text(text, this.#font, fontWorld, material)
    body.name = "body"

    this.#logContainer.add(ts)
    this.#logContainer.add(body)
    this.#entries.push({ts, body, data: entry})
  }

  #disposeEntry(entry: RenderedEntry): void {
    this.#renderer.invalidateGeometry(entry.ts.stencilGeometry)
    this.#renderer.invalidateGeometry(entry.ts.coverGeometry)
    this.#renderer.invalidateGeometry(entry.body.stencilGeometry)
    this.#renderer.invalidateGeometry(entry.body.coverGeometry)
    const idx = this.#logContainer.children.indexOf(entry.ts)
    if (idx >= 0) this.#logContainer.children.splice(idx, 1)
    const idx2 = this.#logContainer.children.indexOf(entry.body)
    if (idx2 >= 0) this.#logContainer.children.splice(idx2, 1)
  }

  #materialForLevel(level: string | undefined): TextMaterial {
    switch (level) {
      case "warning":
      case "warn":
        return this.#warnMaterial
      case "error":
        return this.#errorMaterial
      case "debug":
      case "verbose":
        return this.#debugMaterial
      default:
        return this.#infoMaterial
    }
  }

  // Раскладываем все entries сверху вниз, с учётом #scrollOffset.
  #applyScroll(): void {
    const lineHeightWorld = LINE_PX * this.#pixelScale
    const tsXWorld = 0
    const bodyXWorld = TS_GUTTER_PX * this.#pixelScale
    const tsFontWorld = TS_FONT_PX * this.#pixelScale
    const fontWorld = FONT_PX * this.#pixelScale
    const scrollWorld = this.#scrollOffset * this.#pixelScale

    for (let i = 0; i < this.#entries.length; i++) {
      const e = this.#entries[i]!
      const rowTopWorld = -(i * LINE_PX) * this.#pixelScale + scrollWorld
      e.ts.position.x = tsXWorld
      e.ts.position.y = rowTopWorld - tsFontWorld
      e.ts.updateMatrix()
      e.body.position.x = bodyXWorld
      e.body.position.y = rowTopWorld - fontWorld
      e.body.updateMatrix()
    }
  }

  #isAtBottom(): boolean {
    const totalHeight = this.#entries.length * LINE_PX
    const visibleHeight = this.#contentPixelHeight
    if (totalHeight <= visibleHeight) return true
    const maxScroll = totalHeight - visibleHeight
    return this.#scrollOffset >= maxScroll - AUTOSCROLL_TOLERANCE_PX
  }

  #scrollToBottom(): void {
    const totalHeight = this.#entries.length * LINE_PX
    const visibleHeight = this.#contentPixelHeight
    this.#scrollOffset = Math.max(0, totalHeight - visibleHeight)
  }

  #setScroll(next: number): void {
    const totalHeight = this.#entries.length * LINE_PX
    const visibleHeight = this.#contentPixelHeight
    const maxScroll = Math.max(0, totalHeight - visibleHeight)
    const clamped = Math.max(0, Math.min(maxScroll, next))
    if (clamped === this.#scrollOffset) return
    this.#scrollOffset = clamped
    this.#applyScroll()
    this.#requestRender()
  }

  #attachWheelListener(): void {
    if (this.#wheelHandler !== null) return
    const handler = (event: WheelEvent): void => {
      event.preventDefault()
      const pixelDelta = event.deltaMode === 1
        ? event.deltaY * LINE_PX
        : event.deltaMode === 2
          ? event.deltaY * this.#contentPixelHeight
          : event.deltaY
      this.#scrollAccum += pixelDelta
      const step = Math.trunc(this.#scrollAccum)
      this.#scrollAccum -= step
      if (step !== 0) this.#setScroll(this.#scrollOffset + step)
    }
    this.#canvas.addEventListener("wheel", handler, {passive: false})
    this.#wheelHandler = handler
  }

  #detachWheelListener(): void {
    if (this.#wheelHandler !== null) {
      this.#canvas.removeEventListener("wheel", this.#wheelHandler)
      this.#wheelHandler = null
    }
  }

  #renderFrame(): void {
    if (this.#disposed) return
    this.#scene.updateWorldMatrix()
    this.#renderer.render(this.#scene, this.#viewPoint)
  }

  #requestRender(): void {
    if (this.#renderRequested || this.#disposed) return
    this.#renderRequested = true
    this.#rafId = requestAnimationFrame(() => {
      this.#rafId = null
      this.#renderRequested = false
      this.#renderFrame()
    })
  }
}

// "2026-05-05T11:11:11.111Z" → "11:11:11" (часть после T до точки).
function formatTimestamp(ts: string): string {
  const t = ts.indexOf("T")
  if (t < 0) return ts
  const dot = ts.indexOf(".", t)
  return ts.slice(t + 1, dot < 0 ? undefined : dot)
}
