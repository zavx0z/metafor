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

export type XrToken = {s: number; e: number; c: string}
export type XrSourceTokens = XrToken[][]

export type XrSource = {
  lines: string[]
  currentLine: number
  location: string
  tokens?: XrSourceTokens
}

const CONTENT_PAD_TOP_PX = 34
const CONTENT_PAD_LEFT_PX = 10
const CONTENT_PAD_RIGHT_PX = 10
const CONTENT_PAD_BOTTOM_PX = 8
const GUTTER_MIN_PX = 56
const GUTTER_LEFT_PAD_PX = 8
const GUTTER_RIGHT_PAD_PX = 12
const CODE_LEFT_PAD_PX = 12
const GUTTER_RULE_PX = 1
const LINE_PX = 18
const CODE_FONT_PX = 12
const FONT_URL = "/JetBrainsMono-Bold.ttf"

const COLOR_BG = new Color(22 / 255, 27 / 255, 34 / 255, 1)
const COLOR_HIGHLIGHT = new Color(56 / 255, 139 / 255, 253 / 255, 0.16)
const COLOR_TEXT = new Color(225 / 255, 228 / 255, 233 / 255, 1)
const COLOR_GUTTER = new Color(110 / 255, 118 / 255, 129 / 255, 0.8)
const COLOR_GUTTER_HOT = new Color(247 / 255, 129 / 255, 102 / 255, 1)
const COLOR_GUTTER_RULE = new Color(48 / 255, 54 / 255, 61 / 255, 1)

// Палитра под GitHub Dark / VS Code Dark+ — соответствует категориям из
// pkg/debug/src/syntax.ts (k=keyword, s=string, n=number, c=comment,
// t=type, f=function, p=punctuation, d=default).
const TOKEN_COLORS: Record<string, Color> = {
  k: new Color(255 / 255, 123 / 255, 114 / 255, 1),
  s: new Color(165 / 255, 214 / 255, 255 / 255, 1),
  n: new Color(121 / 255, 192 / 255, 255 / 255, 1),
  c: new Color(139 / 255, 148 / 255, 158 / 255, 1),
  t: new Color(255 / 255, 166 / 255, 87 / 255, 1),
  f: new Color(210 / 255, 168 / 255, 255 / 255, 1),
  p: new Color(201 / 255, 209 / 255, 217 / 255, 1),
  d: new Color(225 / 255, 228 / 255, 233 / 255, 1),
}

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
  readonly #gutterRule: Mesh
  readonly #contentContainer: Object3D
  readonly #codeContainer: Object3D
  readonly #layoutManager: LayoutManager
  readonly #lineMaterial: TextMaterial
  readonly #gutterMaterial: TextMaterial
  readonly #gutterHotMaterial: TextMaterial
  readonly #tokenMaterials: Map<string, TextMaterial> = new Map()
  #physicalHeight = 0.6
  #physicalWidth = 0.6
  #pixelWidth = 600
  #pixelHeight = 600
  #contentPixelWidth = 580
  #contentPixelHeight = 558
  #pixelScale = 0.001
  #cameraDistance = 0.6
  #rafId: number | null = null
  #renderRequested = false
  #disposed = false
  #current: XrSource | null = null
  #layoutDirty = true
  #scrollOffset = 0  // первый видимый индекс строки в lines (0-based)
  #scrollAccum = 0   // субпиксельный остаток от wheel
  #wheelHandler: ((event: WheelEvent) => void) | null = null

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

    this.#gutterRule = new Mesh(
      new PlaneGeometry({width: 1, height: 1}),
      new MeshBasicMaterial({color: COLOR_GUTTER_RULE}),
    )
    this.#gutterRule.position.z = 0.001

    this.#layoutManager = new LayoutManager()
    this.#lineMaterial = new TextMaterial({color: COLOR_TEXT})
    this.#gutterMaterial = new TextMaterial({color: COLOR_GUTTER})
    this.#gutterHotMaterial = new TextMaterial({color: COLOR_GUTTER_HOT})
    for (const [category, color] of Object.entries(TOKEN_COLORS)) {
      this.#tokenMaterials.set(category, new TextMaterial({color}))
    }

    this.#contentContainer = new Object3D()
    this.#contentContainer.position.z = 0.002
    this.#card.add(this.#contentContainer)
    this.#contentContainer.add(this.#gutterRule)

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
    // Размер берём из bounding rect (а НЕ clientWidth/Height): после
    // setSize() canvas.width attribute становится w*devicePixelRatio, и
    // некоторые браузеры используют его как intrinsic size — clientWidth
    // тогда удваивается. rect отдаёт реальный CSS-box от стилей.
    const rect = this.#canvas.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    // Если canvas ещё не получил layout (0×0 — DOM ещё не разложен или
    // секция скрыта), пропускаем. ResizeObserver вызовет нас снова, когда
    // размер появится. Минимальный 1×1 НЕ задаём — это бы зафиксировало
    // canvas с aspect-ratio 1/1 inline-style'ом и поломало CSS calc(100%-…).
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

    this.#contentPixelWidth = Math.max(1, this.#pixelWidth - CONTENT_PAD_LEFT_PX - CONTENT_PAD_RIGHT_PX)
    this.#contentPixelHeight = Math.max(1, this.#pixelHeight - CONTENT_PAD_TOP_PX - CONTENT_PAD_BOTTOM_PX)

    // Контент сдвинут к верхнему-левому углу карты (Yoga origin) с явным
    // отступом под абсолютный h2. LayoutManager переводит left/top пиксели Yoga
    // в position.x = left*scale, position.y = -top*scale.
    this.#contentContainer.position.x = -this.#physicalWidth / 2 + CONTENT_PAD_LEFT_PX * this.#pixelScale
    this.#contentContainer.position.y = this.#physicalHeight / 2 - CONTENT_PAD_TOP_PX * this.#pixelScale
    this.#contentContainer.updateMatrix()

    this.#codeContainer.layout = {
      width: this.#contentPixelWidth,
      height: this.#contentPixelHeight,
      flexDirection: "column",
      alignItems: "stretch",
    }

    if (this.#current !== null) this.#renderLines()
    this.#layoutDirty = true
    this.#requestRender()
  }

  start(): void {
    if (this.#disposed) return
    this.#attachWheelListener()
    this.handleResize()
  }

  stop(): void {
    if (this.#rafId !== null) cancelAnimationFrame(this.#rafId)
    this.#rafId = null
    this.#renderRequested = false
    this.#detachWheelListener()
  }

  dispose(): void {
    this.stop()
    this.#disposed = true
  }

  setSource(source: XrSource): void {
    const sourceChanged = this.#current?.location !== source.location
    this.#current = source
    if (sourceChanged) {
      // Новый файл — центрируем окно вокруг currentLine.
      const visible = this.#visibleLineCount()
      this.#scrollOffset = Math.max(0, source.currentLine - 1 - Math.floor(visible / 2))
    }
    this.#renderLines()
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
    if (this.#renderRequested || this.#disposed) return
    this.#renderRequested = true
    this.#rafId = requestAnimationFrame(() => {
      this.#rafId = null
      this.#renderRequested = false
      this.#renderFrame()
    })
  }

  #visibleLineCount(): number {
    return Math.max(1, Math.floor(this.#contentPixelHeight / LINE_PX))
  }

  #attachWheelListener(): void {
    if (this.#wheelHandler !== null) return
    const handler = (event: WheelEvent): void => {
      if (this.#current === null) return
      event.preventDefault()
      // deltaMode 0 = pixel, 1 = line, 2 = page. Приводим к строкам.
      const linesDelta = event.deltaMode === 1
        ? event.deltaY
        : event.deltaMode === 2
          ? event.deltaY * this.#visibleLineCount()
          : (this.#scrollAccum + event.deltaY) / LINE_PX
      const stepLines = Math.trunc(linesDelta)
      if (event.deltaMode === 0) {
        this.#scrollAccum = (this.#scrollAccum + event.deltaY) - stepLines * LINE_PX
      } else {
        this.#scrollAccum = 0
      }
      if (stepLines === 0) return
      const total = this.#current.lines.length
      const visible = this.#visibleLineCount()
      const max = Math.max(0, total - visible)
      const next = Math.min(max, Math.max(0, this.#scrollOffset + stepLines))
      if (next === this.#scrollOffset) return
      this.#scrollOffset = next
      this.#renderLines()
      this.#layoutDirty = true
      this.#requestRender()
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

  // TODO[engine-ui] переиспользовать row-объекты между фреймами вместо
  // полного пересоздания (профайлить когда строк станет больше 100).
  #renderLines(): void {
    this.#codeContainer.children = []
    this.#hideGutterRule()

    if (this.#current === null) return
    const lines = this.#current.lines
    const currentLine = this.#current.currentLine
    if (lines.length === 0) return

    const maxLines = this.#visibleLineCount()
    const start = Math.min(
      Math.max(0, lines.length - maxLines),
      Math.max(0, this.#scrollOffset),
    )
    this.#scrollOffset = start
    const end = Math.min(lines.length, start + maxLines)

    const lineFontWorld = lineFontWorldFor(this.#pixelScale)
    const gutterPx = this.#gutterWidthPx(lines.length)
    const codeWidthPx = Math.max(1, this.#contentPixelWidth - gutterPx)
    this.#syncGutterRule(gutterPx)

    // Раскладываем строки ВРУЧНУЮ относительно codeContainer (без row-Yoga):
    //   y = -(i * LINE_PX + lineFontWorld) * scale
    //   numText.x = right-aligned внутри [0..gutterPx]
    //   lineText.x = (gutterPx + CODE_LEFT_PAD_PX) * scale
    // Yoga применяем только к codeContainer (root) — он позиционирует сам
    // contentContainer относительно карты. Внутри — детерминистичная сетка.
    void codeWidthPx
    const contentWorldW = this.#contentPixelWidth * this.#pixelScale
    const highlightWorldH = LINE_PX * this.#pixelScale

    for (let i = 0; i < end - start; i++) {
      const lineIndex = start + i
      const lineNo = lineIndex + 1
      const isCurrent = lineNo === currentLine
      const text = lines[lineIndex] ?? ""
      const rowTopWorld = -(i * LINE_PX) * this.#pixelScale
      const baselineY = rowTopWorld - lineFontWorld

      if (isCurrent) {
        const hl = new Mesh(
          new PlaneGeometry({width: contentWorldW, height: highlightWorldH}),
          new MeshBasicMaterial({color: COLOR_HIGHLIGHT}),
        )
        hl.position.x = contentWorldW / 2
        hl.position.y = rowTopWorld - highlightWorldH / 2
        hl.position.z = -0.0005
        hl.updateMatrix()
        this.#codeContainer.add(hl)
      }

      const numStr = String(lineNo)
      const numMaterial = isCurrent ? this.#gutterHotMaterial : this.#gutterMaterial
      const numText = new Text(numStr, this.#font, lineFontWorld, numMaterial)
      numText.position.x = this.#lineNumberX(numStr, gutterPx, lineFontWorld)
      numText.position.y = baselineY
      numText.updateMatrix()
      this.#codeContainer.add(numText)

      if (text.length > 0) {
        const trimmed = text.length > 200 ? `${text.slice(0, 199)}…` : text
        const codeStartX = (gutterPx + CODE_LEFT_PAD_PX) * this.#pixelScale
        const lineTokens = this.#current.tokens?.[lineIndex]
        if (lineTokens !== undefined && lineTokens.length > 0) {
          this.#renderTokenizedLine(trimmed, lineTokens, codeStartX, baselineY, lineFontWorld)
        } else {
          const lineText = new Text(trimmed, this.#font, lineFontWorld, this.#lineMaterial)
          lineText.position.x = codeStartX
          lineText.position.y = baselineY
          lineText.updateMatrix()
          this.#codeContainer.add(lineText)
        }
      }
    }
  }

  // Рендерит одну строку как последовательность Text-объектов по категориям
  // токенов. Между токенами идут промежутки (whitespace, не-описанные
  // диапазоны) — их рисуем как 'd' (default), чтобы пустоты не вводили
  // видимых сдвигов.
  #renderTokenizedLine(
    text: string,
    tokens: XrToken[],
    startX: number,
    baselineY: number,
    fontSize: number,
  ): void {
    let cursor = 0
    let cursorX = startX
    const placeChunk = (chunkText: string, category: string): void => {
      if (chunkText.length === 0) return
      const material = this.#tokenMaterials.get(category) ?? this.#lineMaterial
      const t = new Text(chunkText, this.#font, fontSize, material)
      t.position.x = cursorX
      t.position.y = baselineY
      t.updateMatrix()
      this.#codeContainer.add(t)
      cursorX += measureTextWorld(chunkText, this.#font, fontSize)
    }
    const sorted = [...tokens].sort((a, b) => a.s - b.s)
    for (const tok of sorted) {
      if (tok.s > cursor) placeChunk(text.slice(cursor, tok.s), "d")
      const span = text.slice(tok.s, Math.min(tok.e, text.length))
      placeChunk(span, tok.c)
      cursor = Math.max(cursor, tok.e)
    }
    if (cursor < text.length) placeChunk(text.slice(cursor), "d")
  }

  #gutterWidthPx(lineCount: number): number {
    const digits = Math.max(2, String(Math.max(1, lineCount)).length)
    const digitWidthPx = measureTextWorld("8", this.#font, lineFontWorldFor(this.#pixelScale)) / this.#pixelScale
    return Math.ceil(Math.max(
      GUTTER_MIN_PX,
      GUTTER_LEFT_PAD_PX + digitWidthPx * digits + GUTTER_RIGHT_PAD_PX,
    ))
  }

  #lineNumberX(text: string, gutterPx: number, fontSizeWorld: number): number {
    const widthWorld = measureTextWorld(text, this.#font, fontSizeWorld)
    const rightEdgeWorld = (gutterPx - GUTTER_RIGHT_PAD_PX) * this.#pixelScale
    const leftInsetWorld = GUTTER_LEFT_PAD_PX * this.#pixelScale
    return Math.max(leftInsetWorld, rightEdgeWorld - widthWorld)
  }

  #syncGutterRule(gutterPx: number): void {
    const width = GUTTER_RULE_PX * this.#pixelScale
    const height = this.#contentPixelHeight * this.#pixelScale
    this.#gutterRule.geometry = new PlaneGeometry({width, height})
    this.#gutterRule.visible = true
    this.#gutterRule.position.x = gutterPx * this.#pixelScale + width / 2
    this.#gutterRule.position.y = -height / 2
    this.#gutterRule.updateMatrix()
  }

  #hideGutterRule(): void {
    this.#gutterRule.visible = false
  }
}

function lineFontWorldFor(pixelScale: number): number {
  return CODE_FONT_PX * pixelScale
}

function measureTextWorld(text: string, font: TrueTypeFont, fontSize: number): number {
  const scale = fontSize / font.unitsPerEm
  const letterSpacing = fontSize * 0.05
  let width = 0
  for (const char of text) {
    if (char === " ") {
      width += font.unitsPerEm * 0.3 * scale
      continue
    }
    const gid = font.mapCharToGlyph(char.codePointAt(0)!)
    width += font.getHMetric(gid).advanceWidth * scale + letterSpacing
  }
  return width
}
