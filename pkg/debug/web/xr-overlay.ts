/**
 * Engine source-view: пилотный шаг миграции debug-UI на @metafor/engine.
 *
 * Канвас встаёт на место HTML <pre id="source-view"> внутри #source-section,
 * рендерит исходник текущего паузнутого фрейма средствами WebGPU-движка
 * (Renderer/Scene/Text + Yoga flexbox через LayoutManager).
 *
 * Камера смотрит ПЕРПЕНДИКУЛЯРНО вниз на плоскость локального XY (без
 * rotation у контента) — так слева/справа в layout совпадают со слева/справа
 * на экране, без зеркала.
 *
 * Render-on-demand: один кадр после setSource/handleResize, RAF-цикл только
 * пока активен pointer/wheel на canvas.
 *
 * TODO[engine-ui] перенести аналогично frames/scopes/console.
 * TODO[engine-ui] подсветка синтаксиса (несколько TextMaterial → токены).
 * TODO[engine-ui] переиспользование Text-объектов между фреймами.
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
import {LayoutManager} from "../../engine/src/layout/LayoutManager.ts"
import YogaService from "../../engine/src/layout/YogaService.ts"

export type XrSource = {
  lines: string[]
  currentLine: number
  location: string
}

const PADDING_PX = 12
const GUTTER_PX = 60
const LINE_PX = 18
const CODE_FONT_PX = 13
const FONT_URL = "/JetBrainsMono-Bold.ttf"

const COLOR_BG = new Color(22 / 255, 27 / 255, 34 / 255, 1)
const COLOR_HIGHLIGHT = new Color(56 / 255, 139 / 255, 253 / 255, 0.16)
const COLOR_TEXT = new Color(225 / 255, 228 / 255, 233 / 255, 1)
const COLOR_GUTTER = new Color(110 / 255, 118 / 255, 129 / 255, 0.8)
const COLOR_GUTTER_HOT = new Color(247 / 255, 129 / 255, 102 / 255, 1)

export class XrOverlay {
  static async create(canvas: HTMLCanvasElement): Promise<XrOverlay> {
    await YogaService.instance.initialize()
    const renderer = new Renderer()
    await renderer.init(canvas)
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    const font = await TrueTypeFont.fromUrl(FONT_URL)
    return new XrOverlay(canvas, renderer, font)
  }

  readonly #canvas: HTMLCanvasElement
  readonly #renderer: Renderer
  readonly #font: TrueTypeFont
  readonly #scene: Scene
  readonly #viewPoint: ViewPoint
  readonly #card: Object3D
  readonly #background: Mesh
  readonly #contentContainer: Object3D
  readonly #codeContainer: Object3D
  readonly #layoutManager: LayoutManager
  readonly #lineMaterial: TextMaterial
  readonly #gutterMaterial: TextMaterial
  readonly #gutterHotMaterial: TextMaterial
  #physicalHeight = 0.6
  #physicalWidth = 0.6
  #pixelWidth = 600
  #pixelHeight = 600
  #pixelScale = 0.001
  #cameraDistance = 0.6
  #rafId: number | null = null
  #renderRequested = false
  #disposed = false
  #current: XrSource | null = null
  #layoutDirty = true
  #interactionLoop = false
  #idleTimer: ReturnType<typeof setTimeout> | null = null
  #pointerDownHandler: (() => void) | null = null
  #pointerUpHandler: (() => void) | null = null
  #wheelHandler: (() => void) | null = null

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer, font: TrueTypeFont) {
    this.#canvas = canvas
    this.#renderer = renderer
    this.#font = font

    this.#scene = new Scene()
    this.#scene.background = new Color(0, 0, 0, 0)

    // Камера в +Z, смотрит на (0,0,0) вниз. Up = (0,1,0): локальная +Y → вверх
    // на экране, +X → вправо. Никакого rotation у плоскости — видим лицевую
    // сторону без зеркала.
    this.#viewPoint = new ViewPoint({
      element: canvas,
      fov: Math.PI / 4,
      near: 0.01,
      far: 50,
      position: {x: 0, y: 0, z: this.#cameraDistance},
      target: {x: 0, y: 0, z: 0},
    })
    this.#setCameraUpY()
    this.#detachViewPointInput()

    this.#card = new Object3D()
    this.#scene.add(this.#card)

    this.#background = new Mesh(
      new PlaneGeometry({width: 1, height: 1}),
      new MeshBasicMaterial({color: COLOR_BG}),
    )
    this.#card.add(this.#background)

    this.#layoutManager = new LayoutManager()
    this.#lineMaterial = new TextMaterial({color: COLOR_TEXT})
    this.#gutterMaterial = new TextMaterial({color: COLOR_GUTTER})
    this.#gutterHotMaterial = new TextMaterial({color: COLOR_GUTTER_HOT})

    this.#contentContainer = new Object3D()
    this.#contentContainer.position.z = 0.002
    this.#card.add(this.#contentContainer)

    this.#codeContainer = new Object3D()
    this.#codeContainer.layout = {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      alignItems: "stretch",
    }
    this.#contentContainer.add(this.#codeContainer)
  }

  // ViewPoint конструктор вешает orbit-listeners на canvas — для встроенного
  // редактора кода они мешают (drag = выделение текста, wheel = scroll).
  // Снимаем их через публичный dispose, который удаляет именно слушатели.
  #detachViewPointInput(): void {
    this.#viewPoint.dispose()
  }

  #setCameraUpY(): void {
    const vp = this.#viewPoint as unknown as {up: {set(x: number, y: number, z: number): void}}
    vp.up.set(0, 1, 0)
    this.#viewPoint.update()
  }

  handleResize(): void {
    // Берём CSS-размер из bounding rect (а НЕ clientWidth/Height): после
    // setSize() canvas.width attribute становится w*devicePixelRatio, и
    // некоторые браузеры используют его как intrinsic size — clientWidth
    // тогда удваивается каждый ResizeObserver-tick → петля → texture-size
    // overflow. Через rect мы получаем реальный CSS-box, заданный стилем
    // (width: calc(100% - 32px)).
    const rect = this.#canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    if (w === this.#pixelWidth && h === this.#pixelHeight) return

    // Фиксируем CSS-размер ещё раз стилем — на случай, если intrinsic от
    // canvas.width пытается распирать его.
    this.#canvas.style.width = `${w}px`
    this.#canvas.style.height = `${h}px`
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

    // Контент сдвинут к верхнему-левому углу карты (Yoga origin). LayoutManager
    // переводит left/top пиксели Yoga в position.x = left*scale, position.y = -top*scale.
    this.#contentContainer.position.x = -this.#physicalWidth / 2
    this.#contentContainer.position.y = this.#physicalHeight / 2
    this.#contentContainer.updateMatrix()

    this.#codeContainer.layout = {
      width: this.#pixelWidth,
      height: this.#pixelHeight,
      flexDirection: "column",
      alignItems: "stretch",
      padding: PADDING_PX,
    }

    this.#layoutDirty = true
    this.#requestRender()
  }

  start(): void {
    if (this.#disposed) return
    this.#attachInteractionListeners()
    this.handleResize()
  }

  stop(): void {
    if (this.#rafId !== null) cancelAnimationFrame(this.#rafId)
    this.#rafId = null
    this.#renderRequested = false
    this.#interactionLoop = false
    if (this.#idleTimer !== null) {
      clearTimeout(this.#idleTimer)
      this.#idleTimer = null
    }
    this.#detachInteractionListeners()
  }

  dispose(): void {
    this.stop()
    this.#disposed = true
  }

  setSource(source: XrSource): void {
    this.#current = source
    this.#renderLines(source.lines, source.currentLine)
    this.#layoutDirty = true
    this.#requestRender()
  }

  refresh(): void {
    if (this.#current !== null) this.setSource(this.#current)
  }

  #renderFrame(): void {
    if (this.#disposed) return
    if (this.#layoutDirty) {
      this.#layoutManager.update(
        this.#codeContainer,
        this.#pixelWidth,
        this.#pixelHeight,
        this.#pixelScale,
      )
      this.#layoutDirty = false
    }
    this.#scene.updateWorldMatrix()
    this.#renderer.render(this.#scene, this.#viewPoint)
  }

  #requestRender(): void {
    if (this.#renderRequested || this.#interactionLoop || this.#disposed) return
    this.#renderRequested = true
    this.#rafId = requestAnimationFrame(() => {
      this.#rafId = null
      this.#renderRequested = false
      this.#renderFrame()
    })
  }

  #startInteractionLoop(): void {
    if (this.#interactionLoop || this.#disposed) return
    this.#interactionLoop = true
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId)
      this.#rafId = null
      this.#renderRequested = false
    }
    const tick = (): void => {
      if (!this.#interactionLoop || this.#disposed) return
      this.#renderFrame()
      this.#rafId = requestAnimationFrame(tick)
    }
    this.#rafId = requestAnimationFrame(tick)
  }

  #stopInteractionLoopSoon(): void {
    if (this.#idleTimer !== null) clearTimeout(this.#idleTimer)
    this.#idleTimer = setTimeout(() => {
      this.#idleTimer = null
      if (!this.#interactionLoop) return
      this.#interactionLoop = false
      if (this.#rafId !== null) {
        cancelAnimationFrame(this.#rafId)
        this.#rafId = null
      }
      this.#requestRender()
    }, 150)
  }

  #attachInteractionListeners(): void {
    if (this.#pointerDownHandler !== null) return
    const onDown = (): void => this.#startInteractionLoop()
    const onUp = (): void => this.#stopInteractionLoopSoon()
    const onWheel = (): void => {
      if (!this.#interactionLoop) {
        this.#startInteractionLoop()
        this.#stopInteractionLoopSoon()
      } else {
        this.#stopInteractionLoopSoon()
      }
    }
    this.#canvas.addEventListener("pointerdown", onDown)
    window.addEventListener("pointerup", onUp)
    this.#canvas.addEventListener("wheel", onWheel, {passive: true})
    this.#pointerDownHandler = onDown
    this.#pointerUpHandler = onUp
    this.#wheelHandler = onWheel
  }

  #detachInteractionListeners(): void {
    if (this.#pointerDownHandler !== null) {
      this.#canvas.removeEventListener("pointerdown", this.#pointerDownHandler)
      this.#pointerDownHandler = null
    }
    if (this.#pointerUpHandler !== null) {
      window.removeEventListener("pointerup", this.#pointerUpHandler)
      this.#pointerUpHandler = null
    }
    if (this.#wheelHandler !== null) {
      this.#canvas.removeEventListener("wheel", this.#wheelHandler)
      this.#wheelHandler = null
    }
  }

  // TODO[engine-ui] переиспользовать row-объекты между фреймами вместо
  // полного пересоздания (профайлить когда строк станет больше 100).
  #renderLines(lines: string[], currentLine: number): void {
    this.#codeContainer.children = []

    if (lines.length === 0) return

    const maxLines = Math.max(1, Math.floor((this.#pixelHeight - PADDING_PX * 2) / LINE_PX))
    const half = Math.floor(maxLines / 2)
    let start = Math.max(0, currentLine - 1 - half)
    const end = Math.min(lines.length, start + maxLines)
    if (end - start < maxLines) start = Math.max(0, end - maxLines)

    const lineFontWorld = lineFontWorldFor(this.#pixelScale)
    const codeWidthPx = this.#pixelWidth - PADDING_PX * 2 - GUTTER_PX

    for (let i = 0; i < end - start; i++) {
      const lineIndex = start + i
      const lineNo = lineIndex + 1
      const isCurrent = lineNo === currentLine
      const text = lines[lineIndex] ?? ""

      const row = new Object3D()
      row.layout = {
        width: "100%",
        height: LINE_PX,
        flexDirection: "row",
        alignItems: "flex-start",
      }

      if (isCurrent) {
        const highlightWorldH = LINE_PX * this.#pixelScale
        const contentWorldW =
          (this.#pixelWidth - PADDING_PX * 2) * this.#pixelScale
        const hl = new Mesh(
          new PlaneGeometry({width: contentWorldW, height: highlightWorldH}),
          new MeshBasicMaterial({color: COLOR_HIGHLIGHT}),
        )
        // row якорь — в его верхнем-левом углу. Plane центрирован, поэтому
        // сдвигаем на половину ширины вправо и половину высоты вниз.
        hl.position.x = contentWorldW / 2
        hl.position.y = -highlightWorldH / 2
        hl.position.z = -0.0005
        hl.updateMatrix()
        row.add(hl)
      }

      const gutter = new Object3D()
      gutter.layout = {width: GUTTER_PX, height: LINE_PX}
      const numStr = String(lineNo).padStart(4, " ")
      const numMaterial = isCurrent ? this.#gutterHotMaterial : this.#gutterMaterial
      const numText = new Text(numStr, this.#font, lineFontWorld, numMaterial)
      numText.position.y = -lineFontWorld
      numText.updateMatrix()
      gutter.add(numText)
      row.add(gutter)

      const code = new Object3D()
      code.layout = {width: codeWidthPx, height: LINE_PX}
      if (text.length > 0) {
        const trimmed = text.length > 200 ? `${text.slice(0, 199)}…` : text
        const lineText = new Text(trimmed, this.#font, lineFontWorld, this.#lineMaterial)
        lineText.position.y = -lineFontWorld
        lineText.updateMatrix()
        code.add(lineText)
      }
      row.add(code)

      this.#codeContainer.add(row)
    }
  }
}

function lineFontWorldFor(pixelScale: number): number {
  return CODE_FONT_PX * pixelScale
}
