/**
 * XR-overlay поверх обычного debug-UI: WebGPU-canvas, на котором стоит
 * полупрозрачная карточка в стиле Apple Vision Pro и рендерится текстом
 * фрагмент исходника на месте текущей точки останова.
 *
 * Задел на будущее — в WebXR-сессии та же сцена должна показываться в
 * иммерсивном режиме без правок: 2D-вёрстка строится в локальной XY
 * карточки, источник данных тот же что у HTML-source view.
 *
 * TODO[xr-editor] перевести разметку на UIDisplay + LayoutManager (Yoga
 *   flexbox) из @metafor/engine: каждая строка — row-контейнер с двумя
 *   layout-нодами (gutter + код), Highlight через absolute-узел.
 *   Сейчас строки расставлены вручную через position.x/position.y, чтобы
 *   не тащить Yoga-WASM в сидекар на текущем этапе.
 * TODO[xr-editor] полноценный редактор кода: подсветка синтаксиса,
 *   inline-значения переменных из scope, клик по строке = goto definition,
 *   conditional breakpoints через тот же LayoutManager.
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
  ViewPoint,
} from "@metafor/engine"

export type XrSource = {
  lines: string[]
  currentLine: number
  location: string
}

const CARD_WIDTH = 0.72
const CARD_HEIGHT = 0.46
const PADDING = 0.022
const TITLE_FONT_SIZE = 0.014
const LINE_FONT_SIZE = 0.011
const LINE_HEIGHT = 0.0145
const VISIBLE_LINES = 26
const GUTTER_WIDTH = 0.04
const FONT_URL = "/JetBrainsMono-Bold.ttf"

const COLOR_BG = new Color(20 / 255, 26 / 255, 38 / 255, 0.62)
const COLOR_FRAME = new Color(120 / 255, 134 / 255, 156 / 255, 0.7)
const COLOR_HIGHLIGHT = new Color(247 / 255, 129 / 255, 102 / 255, 0.22)
const COLOR_TEXT = new Color(225 / 255, 228 / 255, 233 / 255, 1)
const COLOR_GUTTER = new Color(139 / 255, 148 / 255, 158 / 255, 0.85)
const COLOR_GUTTER_HOT = new Color(247 / 255, 129 / 255, 102 / 255, 1)
const COLOR_TITLE = new Color(88 / 255, 166 / 255, 255 / 255, 1)

export class XrOverlay {
  static async create(canvas: HTMLCanvasElement): Promise<XrOverlay> {
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
  readonly #card: Object3D
  readonly #linesGroup: Object3D
  readonly #titleMaterial: TextMaterial
  readonly #lineMaterial: TextMaterial
  readonly #gutterMaterial: TextMaterial
  readonly #gutterHotMaterial: TextMaterial
  readonly #highlight: Mesh
  #titleObject: Text | null = null
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

    this.#card = this.#buildCard()
    this.#scene.add(this.#card)

    this.#highlight = this.#buildHighlight()
    this.#card.add(this.#highlight)
    this.#highlight.visible = false

    this.#linesGroup = new Object3D()
    this.#linesGroup.position.z = 0.003
    this.#linesGroup.updateMatrix()
    this.#card.add(this.#linesGroup)

    this.#titleMaterial = new TextMaterial({color: COLOR_TITLE})
    this.#lineMaterial = new TextMaterial({color: COLOR_TEXT})
    this.#gutterMaterial = new TextMaterial({color: COLOR_GUTTER})
    this.#gutterHotMaterial = new TextMaterial({color: COLOR_GUTTER_HOT})

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

  #buildCard(): Object3D {
    const group = new Object3D()
    // Поднимаем карточку вертикально: PlaneGeometry создаётся в локальной XY,
    // поворот rotation.x = π/2 ставит её перпендикулярно мировой оси Y, чтобы
    // камера, стоящая на отрицательной Y, видела её фронтально.
    group.rotation.x = Math.PI / 2

    const bgGeo = new PlaneGeometry({width: CARD_WIDTH, height: CARD_HEIGHT})
    const bg = new Mesh(bgGeo, new MeshBasicMaterial({color: COLOR_BG}))
    group.add(bg)

    // Тонкая рамка-окантовка: ещё одна plane чуть крупнее, в качестве «свечения».
    const frameGeo = new PlaneGeometry({width: CARD_WIDTH + 0.006, height: CARD_HEIGHT + 0.006})
    const frame = new Mesh(frameGeo, new MeshBasicMaterial({color: COLOR_FRAME}))
    frame.position.z = -0.001
    frame.updateMatrix()
    group.add(frame)

    group.updateMatrix()
    return group
  }

  #buildHighlight(): Mesh {
    const geo = new PlaneGeometry({width: CARD_WIDTH - PADDING * 2, height: LINE_HEIGHT})
    const mat = new MeshBasicMaterial({color: COLOR_HIGHLIGHT})
    const mesh = new Mesh(geo, mat)
    mesh.position.z = 0.002
    mesh.updateMatrix()
    return mesh
  }

  #measureWidth(text: string, fontSize: number): number {
    if (text.length === 0) return 0
    const scale = fontSize / this.#font.unitsPerEm
    const letterSpacing = fontSize * 0.05
    let width = 0
    for (const char of text) {
      if (char === " ") {
        width += this.#font.unitsPerEm * 0.3 * scale
        continue
      }
      const code = char.codePointAt(0)
      if (code === undefined) continue
      const gid = this.#font.mapCharToGlyph(code)
      const metric = this.#font.getHMetric(gid)
      width += metric.advanceWidth * scale + letterSpacing
    }
    return width
  }

  #renderTitle(location: string): void {
    if (this.#titleObject !== null) {
      this.#card.children = this.#card.children.filter((c) => c !== this.#titleObject)
      this.#titleObject = null
    }
    if (location.length === 0) return
    const text = new Text(location, this.#font, TITLE_FONT_SIZE, this.#titleMaterial)
    text.position.x = -CARD_WIDTH / 2 + PADDING
    text.position.y = CARD_HEIGHT / 2 - PADDING - TITLE_FONT_SIZE
    text.position.z = 0.003
    text.updateMatrix()
    this.#card.add(text)
    this.#titleObject = text
  }

  // TODO[xr-editor] заменить ручной layout строк на flex-row через LayoutManager:
  //   row { layout: { flexDirection:'row', height: lineHeightPx } }
  //     → gutter Object3D { layout: { width: 60 } }
  //     → code   Object3D { layout: { width: codePx } }
  // и переиспользовать ноды между фреймами вместо пересоздания Text-объектов.
  #renderLines(lines: string[], currentLine: number): void {
    this.#linesGroup.children = []

    if (lines.length === 0) {
      this.#highlight.visible = false
      return
    }

    const half = Math.floor(VISIBLE_LINES / 2)
    let start = Math.max(0, currentLine - 1 - half)
    const end = Math.min(lines.length, start + VISIBLE_LINES)
    if (end - start < VISIBLE_LINES) start = Math.max(0, end - VISIBLE_LINES)

    const top = CARD_HEIGHT / 2 - PADDING - TITLE_FONT_SIZE - 0.018
    const leftGutter = -CARD_WIDTH / 2 + PADDING
    const leftCode = leftGutter + GUTTER_WIDTH

    let highlightY: number | null = null
    for (let i = 0; i < end - start; i++) {
      const lineIndex = start + i
      const lineNo = lineIndex + 1
      const isCurrent = lineNo === currentLine
      const y = top - i * LINE_HEIGHT - LINE_FONT_SIZE
      const text = lines[lineIndex] ?? ""

      const numStr = String(lineNo).padStart(4, " ")
      const numMaterial = isCurrent ? this.#gutterHotMaterial : this.#gutterMaterial
      const numText = new Text(numStr, this.#font, LINE_FONT_SIZE, numMaterial)
      numText.position.x = leftGutter
      numText.position.y = y
      numText.updateMatrix()
      this.#linesGroup.add(numText)

      if (text.length > 0) {
        const trimmed = text.length > 96 ? `${text.slice(0, 95)}…` : text
        const lineText = new Text(trimmed, this.#font, LINE_FONT_SIZE, this.#lineMaterial)
        lineText.position.x = leftCode
        lineText.position.y = y
        lineText.updateMatrix()
        this.#linesGroup.add(lineText)
      }

      if (isCurrent) highlightY = y + LINE_FONT_SIZE * 0.25
    }

    if (highlightY !== null) {
      this.#highlight.visible = true
      this.#highlight.position.y = highlightY
      this.#highlight.updateMatrix()
    } else {
      this.#highlight.visible = false
    }

    this.#linesGroup.updateMatrix()
  }
}
