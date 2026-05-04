/**
 * XR-overlay: WebGPU-canvas с редактором кода на @metafor/engine.
 * Полупрозрачная Vision-Pro карточка, на которой текстом рендерится
 * фрагмент исходника текущей точки останова.
 *
 * Разметка строится через flexbox (Yoga) поверх UIDisplay/LayoutManager:
 *   contentContainer (column, padding, alignItems: stretch)
 *   ├── titleRow (row, height)
 *   │   └── Text(location)
 *   └── code rows × VISIBLE_LINES (row, height)
 *       ├── gutter (width: 56)
 *       │   └── Text(lineNo)
 *       └── code (height)
 *           └── Text(line)
 *
 * Подсветка currentLine — child строки, prepend (отрисовка z-back),
 * растянутый на всю ширину строки. Yoga в LayoutProps пока без position:absolute,
 * поэтому highlight сидит как обычный sibling, но не участвует в layout
 * (display: 'none' эквивалент дать нельзя, поэтому ставим width=0/height=0
 * и потом руками растягиваем геометрию по pixelScale).
 *
 * Готовится как 2D-вёрстка чтобы перенести в WebXR без правок layout-логики.
 *
 * TODO[xr-editor] подсветка синтаксиса (TS/JS токенизация → разные
 *   TextMaterial по цветам), inline-значения переменных из scope,
 *   клик по строке = goto definition, conditional breakpoints.
 * TODO[xr-editor] переиспользование Text-объектов между фреймами
 *   (сейчас при каждом setSource Text-объекты пересоздаются).
 * TODO[xr-session] навесить WebXR-сессию (immersive-vr / immersive-ar) +
 *   контроллеры/жесты для навигации по фреймам и scope-tree.
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
  UIDisplay,
  ViewPoint,
} from "@metafor/engine"
import {LayoutManager} from "../../engine/src/layout/LayoutManager.ts"
import YogaService from "../../engine/src/layout/YogaService.ts"

export type XrSource = {
  lines: string[]
  currentLine: number
  location: string
}

const PHYSICAL_WIDTH = 0.72
const PHYSICAL_HEIGHT = 0.45
const PIXEL_WIDTH = 800
const PIXEL_HEIGHT = 500
const PADDING_PX = 16
const GUTTER_PX = 56
const TITLE_ROW_PX = 24
const LINE_PX = 16
const TITLE_FONT_PX = 14
const CODE_FONT_PX = 11
const VISIBLE_LINES = 24
const FONT_URL = "/JetBrainsMono-Bold.ttf"

const COLOR_BG = new Color(20 / 255, 26 / 255, 38 / 255, 0.62)
const COLOR_HIGHLIGHT = new Color(247 / 255, 129 / 255, 102 / 255, 0.22)
const COLOR_TEXT = new Color(225 / 255, 228 / 255, 233 / 255, 1)
const COLOR_GUTTER = new Color(139 / 255, 148 / 255, 158 / 255, 0.85)
const COLOR_GUTTER_HOT = new Color(247 / 255, 129 / 255, 102 / 255, 1)
const COLOR_TITLE = new Color(88 / 255, 166 / 255, 255 / 255, 1)

export class XrOverlay {
  static async create(canvas: HTMLCanvasElement): Promise<XrOverlay> {
    await YogaService.instance.initialize()
    const renderer = new Renderer()
    await renderer.init(canvas)
    const font = await TrueTypeFont.fromUrl(FONT_URL)
    return new XrOverlay(canvas, renderer, font)
  }

  readonly #canvas: HTMLCanvasElement
  readonly #renderer: Renderer
  readonly #font: TrueTypeFont
  readonly #scene: Scene
  readonly #viewPoint: ViewPoint
  readonly #display: UIDisplay
  readonly #layoutManager: LayoutManager
  readonly #titleMaterial: TextMaterial
  readonly #lineMaterial: TextMaterial
  readonly #gutterMaterial: TextMaterial
  readonly #gutterHotMaterial: TextMaterial
  readonly #titleRow: Object3D
  readonly #codeContainer: Object3D
  #titleText: Text | null = null
  #rafId: number | null = null
  #disposed = false
  #current: XrSource | null = null

  private constructor(canvas: HTMLCanvasElement, renderer: Renderer, font: TrueTypeFont) {
    this.#canvas = canvas
    this.#renderer = renderer
    this.#font = font

    this.#scene = new Scene()
    this.#scene.background = new Color(0, 0, 0, 0)

    this.#viewPoint = new ViewPoint({
      element: canvas,
      fov: Math.PI / 4,
      near: 0.05,
      far: 50,
      position: {x: 0, y: -1.05, z: 0},
      target: {x: 0, y: 0, z: 0},
    })

    this.#display = new UIDisplay({
      width: PHYSICAL_WIDTH,
      height: PHYSICAL_HEIGHT,
      pixelWidth: PIXEL_WIDTH,
      pixelHeight: PIXEL_HEIGHT,
      background: COLOR_BG,
    })
    // Карточку поднимаем вертикально (фронт смотрит на -Y).
    this.#display.rotation.x = Math.PI / 2
    this.#display.updateMatrix()
    this.#scene.add(this.#display)

    // Корневой контейнер: row alignItems → column stretch (редактор, не центр).
    this.#display.contentContainer.layout = {
      width: PIXEL_WIDTH,
      height: PIXEL_HEIGHT,
      flexDirection: "column",
      justifyContent: "flex-start",
      alignItems: "stretch",
      padding: PADDING_PX,
    }

    this.#layoutManager = new LayoutManager()

    this.#titleMaterial = new TextMaterial({color: COLOR_TITLE})
    this.#lineMaterial = new TextMaterial({color: COLOR_TEXT})
    this.#gutterMaterial = new TextMaterial({color: COLOR_GUTTER})
    this.#gutterHotMaterial = new TextMaterial({color: COLOR_GUTTER_HOT})

    this.#titleRow = new Object3D()
    this.#titleRow.layout = {
      width: "100%",
      height: TITLE_ROW_PX,
      flexDirection: "row",
      alignItems: "flex-start",
    }
    this.#display.addUI(this.#titleRow)

    this.#codeContainer = new Object3D()
    this.#codeContainer.layout = {
      width: "100%",
      height: VISIBLE_LINES * LINE_PX,
      flexDirection: "column",
      alignItems: "stretch",
    }
    this.#display.addUI(this.#codeContainer)

    this.handleResize()
  }

  handleResize(): void {
    const w = this.#canvas.clientWidth || 1
    const h = this.#canvas.clientHeight || 1
    this.#renderer.setPixelRatio(window.devicePixelRatio || 1)
    this.#renderer.setSize(w, h)
    this.#viewPoint.setAspectRatio(w / h)
  }

  start(): void {
    if (this.#rafId !== null || this.#disposed) return
    const tick = (): void => {
      if (this.#disposed) return
      this.#layoutManager.update(
        this.#display.contentContainer,
        this.#display.pixelWidth,
        this.#display.pixelHeight,
        this.#display.pixelScale,
      )
      this.#scene.updateWorldMatrix()
      this.#renderer.render(this.#scene, this.#viewPoint)
      this.#rafId = requestAnimationFrame(tick)
    }
    this.#rafId = requestAnimationFrame(tick)
  }

  stop(): void {
    if (this.#rafId !== null) cancelAnimationFrame(this.#rafId)
    this.#rafId = null
  }

  dispose(): void {
    this.stop()
    this.#disposed = true
  }

  setSource(source: XrSource): void {
    this.#current = source
    this.#renderTitle(source.location)
    this.#renderLines(source.lines, source.currentLine)
  }

  refresh(): void {
    if (this.#current !== null) this.setSource(this.#current)
  }

  #fontSizeWorld(px: number): number {
    return this.#display.getFontSize(px)
  }

  #renderTitle(location: string): void {
    this.#titleRow.children = []
    if (location.length === 0) {
      this.#titleText = null
      return
    }
    const text = new Text(location, this.#font, this.#fontSizeWorld(TITLE_FONT_PX), this.#titleMaterial)
    // Yoga ставит titleRow в (left*scale, -top*scale). Внутри строки Text без
    // layout остаётся на (0,0) родителя, рисуется вправо-вверх — поэтому
    // сдвигаем его вниз на свою высоту, чтобы baseline совпал с верхом ячейки.
    text.position.y = -this.#fontSizeWorld(TITLE_FONT_PX)
    text.updateMatrix()
    this.#titleRow.add(text)
    this.#titleText = text
  }

  // TODO[xr-editor] переиспользовать row-объекты между фреймами вместо
  // полного пересоздания (профайлить когда строк станет больше 24).
  #renderLines(lines: string[], currentLine: number): void {
    this.#codeContainer.children = []

    if (lines.length === 0) return

    const half = Math.floor(VISIBLE_LINES / 2)
    let start = Math.max(0, currentLine - 1 - half)
    const end = Math.min(lines.length, start + VISIBLE_LINES)
    if (end - start < VISIBLE_LINES) start = Math.max(0, end - VISIBLE_LINES)

    const lineFontWorld = this.#fontSizeWorld(CODE_FONT_PX)

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
        const highlightWorldH = LINE_PX * this.#display.pixelScale
        const contentWorldW =
          (PIXEL_WIDTH - PADDING_PX * 2) * this.#display.pixelScale
        const hl = new Mesh(
          new PlaneGeometry({width: contentWorldW, height: highlightWorldH}),
          new MeshBasicMaterial({color: COLOR_HIGHLIGHT}),
        )
        // Якорь row — верхний-левый угол ячейки, plane по умолчанию центрирован
        // на (0,0,0) → опускаем на половину высоты вниз и сдвигаем на
        // половину ширины вправо, чтобы плашка покрыла всю строку.
        hl.position.x = contentWorldW / 2
        hl.position.y = -highlightWorldH / 2
        hl.position.z = -0.001
        hl.updateMatrix()
        row.add(hl)
      }

      const gutter = new Object3D()
      gutter.layout = {
        width: GUTTER_PX,
        height: LINE_PX,
      }
      const numStr = String(lineNo).padStart(4, " ")
      const numMaterial = isCurrent ? this.#gutterHotMaterial : this.#gutterMaterial
      const numText = new Text(numStr, this.#font, lineFontWorld, numMaterial)
      numText.position.y = -lineFontWorld
      numText.updateMatrix()
      gutter.add(numText)
      row.add(gutter)

      const code = new Object3D()
      code.layout = {
        width: PIXEL_WIDTH - PADDING_PX * 2 - GUTTER_PX,
        height: LINE_PX,
      }
      if (text.length > 0) {
        const trimmed = text.length > 96 ? `${text.slice(0, 95)}…` : text
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
