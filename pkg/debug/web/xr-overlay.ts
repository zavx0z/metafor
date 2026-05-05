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

type CharAnimItem = {
  obj: Text
  finalText: string
  startFraction: number
  settleFraction: number
  nextChangeAt: number
  charset: string
}

const TRANSITION_DURATION_MS = 1300
const SCRAMBLE_INTERVAL_MS = 60
const MATRIX_CHARSET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ{}<>=+[]()*/_-;:.,!?@#$%^&|~…"
const MATRIX_DIGITS = "0123456789"
const randomString = (length: number, charset: string): string => {
  let out = ""
  for (let i = 0; i < length; i++) {
    out += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return out
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
// Overscan по строкам сверху и снизу видимой области. Window = visible + 2*OVERSCAN.
// Каждая строка с syntax-токенами ≈ 6 Text-объектов, каждый Text проходит
// stencil+cover → 12 render-items на строку. Плюс gutter number (×2) + execution
// arrow + highlight + scrollbar (~5). Лимит движка MAX_RENDERABLES=5000:
// безопасно ≈ 350 строк в окне.
const OVERSCAN_LINES = 40
const MAX_RENDERED_LINES = 350

// alpha=0: при использовании в desktop-overlay (space) под канвасом виден
// backdrop-blur. В standalone debug-странице за прозрачным canvas — body-фон
// #0d1117, читаемость не страдает.
const COLOR_BG = new Color(22 / 255, 27 / 255, 34 / 255, 0)
// WebStorm Darcula execution-row — IntelliJ "Execution Point" background
// ≈ #2440A4 (насыщенный medium-blue, чётко контрастирует с panel-фоном).
// Alpha=1, MeshBasicMaterial в этом движке рендерится opaque без блендинга.
const COLOR_HIGHLIGHT = new Color(36 / 255, 64 / 255, 164 / 255, 1)
// Жёлто-оранжевая стрелка ▶ + жирный номер — IntelliJ "Execution Point".
const COLOR_EXEC_ARROW = new Color(255 / 255, 199 / 255, 95 / 255, 1)
const COLOR_TEXT = new Color(225 / 255, 228 / 255, 233 / 255, 1)
const COLOR_GUTTER = new Color(110 / 255, 118 / 255, 129 / 255, 0.8)
const COLOR_GUTTER_HOT = new Color(255 / 255, 199 / 255, 95 / 255, 1)
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
  readonly #execArrowMaterial: TextMaterial
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
  #keyHandler: ((event: KeyboardEvent) => void) | null = null
  #scrollbarThumb: Mesh | null = null
  #scrollbarTrack: Mesh | null = null
  #totalLines = 0
  // Window rendering: рендерим [windowStart .. windowStart + windowSize) строк.
  // Scroll внутри окна — translate position.y. Если scrollOffset уходит за
  // пределы окна, пересобираем Text-объекты с новым windowStart.
  #windowStart = 0
  #windowSize = 0
  #pendingWindowRebuild = false
  // Transition animation при смене файла: Matrix-style scramble на местах.
  // RAF-цикл активен только во время animation, потом обратно render-on-demand.
  #animItems: CharAnimItem[] = []
  #animStart = 0
  #animDuration = 0
  #animActive = false
  #animRunId = 0

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
    // Фон далеко позади, чтобы highlight (за текстом) гарантированно
    // прошёл depth-test в перспективе. Камера в +Z=0.6, near=0.01.
    this.#background.position.z = -0.02
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
    this.#execArrowMaterial = new TextMaterial({color: COLOR_EXEC_ARROW})
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
    this.#attachKeyListener()
    this.handleResize()
  }

  stop(): void {
    if (this.#rafId !== null) cancelAnimationFrame(this.#rafId)
    this.#rafId = null
    this.#renderRequested = false
    this.#detachWheelListener()
    this.#detachKeyListener()
  }

  dispose(): void {
    this.stop()
    this.#disposed = true
  }

  setSource(source: XrSource): void {
    const prev = this.#current
    const lineChanged = prev?.currentLine !== source.currentLine
    const fileChanged = stripLine(prev?.location) !== stripLine(source.location)
    const shouldRecenter = source.currentLine > 0 && (lineChanged || fileChanged || prev === null)

    this.#current = source

    if (shouldRecenter) {
      const visible = this.#visibleLineCount()
      this.#scrollOffset = Math.max(0, source.currentLine - 1 - Math.floor(visible / 2))
    }

    // Transition только при смене файла и если что-то уже отрисовано.
    // Step внутри одного файла рендерится без анимации, чтобы не отвлекать.
    const hadContent = this.#codeContainer.children.length > 0
    const shouldAnimate = prev !== null && fileChanged && hadContent && !this.#disposed

    if (shouldAnimate) {
      if (this.#animActive) this.#completeAnimImmediately()
      this.#startTransition()
    } else {
      this.#renderLines()
      this.#applyScroll()
      this.#layoutDirty = true
      this.#requestRender()
    }
  }

  // Matrix-style transition: новый content стоит на финальных позициях, а
  // буквы волной сверху вниз меняются на случайные и фиксируются в финал.
  #startTransition(): void {
    this.#codeContainer.children = []

    const newObjs = this.#renderLines()
    this.#applyScroll()

    const items: CharAnimItem[] = []
    const now = performance.now()
    const contentHeight = this.#contentPixelHeight * this.#pixelScale
    const lineHeight = LINE_PX * this.#pixelScale

    for (const obj of newObjs) {
      const text = obj as Text
      if (text.isText !== true) continue
      if (text.name !== "gutter" && text.name !== "code" && text.name !== "arrow") continue
      const finalText = text.text
      if (finalText.length === 0) continue

      const visibleY = text.position.y + this.#codeContainer.position.y
      if (visibleY > lineHeight || visibleY < -contentHeight - lineHeight) continue

      const rowFraction = contentHeight > 0
        ? Math.max(0, Math.min(1, -visibleY / contentHeight))
        : 0
      const startFraction = rowFraction * 0.55
      const settleFraction = Math.min(1, startFraction + 0.35)
      const charset = text.name === "gutter" ? MATRIX_DIGITS : MATRIX_CHARSET

      this.#applyTextChange(text, randomString(finalText.length, charset))
      items.push({
        obj: text,
        finalText,
        startFraction,
        settleFraction,
        nextChangeAt: now + Math.random() * SCRAMBLE_INTERVAL_MS,
        charset,
      })
    }

    if (items.length === 0) {
      this.#requestRender()
      return
    }

    this.#animItems = items
    this.#animStart = now
    this.#animDuration = TRANSITION_DURATION_MS
    this.#animActive = true
    this.#animRunId += 1
    this.#layoutDirty = true
    this.#runAnimLoop(this.#animRunId)
  }

  #runAnimLoop(runId: number): void {
    const tick = (): void => {
      if (!this.#animActive || this.#disposed || runId !== this.#animRunId) return
      const now = performance.now()
      const t = Math.min(1, (now - this.#animStart) / this.#animDuration)
      for (const it of this.#animItems) {
        if (t < it.startFraction) continue
        if (t >= it.settleFraction) {
          if (it.obj.text !== it.finalText) this.#applyTextChange(it.obj, it.finalText)
          continue
        }
        if (now >= it.nextChangeAt) {
          this.#applyTextChange(it.obj, randomString(it.finalText.length, it.charset))
          it.nextChangeAt = now + SCRAMBLE_INTERVAL_MS
        }
      }
      this.#renderFrame()
      if (t >= 1) {
        this.#completeAnimImmediately()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  #completeAnimImmediately(): void {
    for (const it of this.#animItems) {
      if (it.obj.text !== it.finalText) this.#applyTextChange(it.obj, it.finalText)
    }
    this.#animItems = []
    this.#animActive = false
    this.#animRunId += 1
    this.#requestRender()
  }

  // Text.updateGeometry() мутирует существующие BufferGeometry, поэтому
  // Renderer.geometryCache нужно сбросить по reference после каждой замены.
  #applyTextChange(text: Text, nextText: string): void {
    if (text.text === nextText) return
    text.text = nextText
    text.updateGeometry()
    this.#renderer.invalidateGeometry(text.stencilGeometry)
    this.#renderer.invalidateGeometry(text.coverGeometry)
    text.updateMatrix()
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
      this.#setScroll(this.#scrollOffset + stepLines)
    }
    this.#canvas.addEventListener("wheel", handler, {passive: false})
    this.#wheelHandler = handler
  }

  #applyScroll(): void {
    // Y-смещение относительно windowStart, а не от 0: codeContainer содержит
    // строки [windowStart..windowEnd), их локальная y начинается с 0.
    const offsetWithinWindow = this.#scrollOffset - this.#windowStart
    this.#codeContainer.position.y = offsetWithinWindow * LINE_PX * this.#pixelScale
    this.#codeContainer.updateMatrix()
    this.#updateScrollbar()
  }

  #setScroll(next: number): void {
    const visible = this.#visibleLineCount()
    const max = Math.max(0, this.#totalLines - visible)
    const clamped = Math.max(0, Math.min(max, Math.trunc(next)))
    if (clamped === this.#scrollOffset) return
    this.#scrollOffset = clamped
    // Если scrollOffset вышел за overscan-зону окна — пересобираем window.
    // Иначе только translate codeContainer.position.y (cheap).
    const windowEnd = this.#windowStart + this.#windowSize
    const visibleEnd = this.#scrollOffset + visible
    const needsRebuild =
      this.#scrollOffset < this.#windowStart + Math.min(OVERSCAN_LINES, this.#windowStart) ||
      visibleEnd > windowEnd - Math.min(OVERSCAN_LINES, this.#totalLines - windowEnd)
    if (needsRebuild) {
      this.#scheduleWindowRebuild()
    } else {
      this.#applyScroll()
      this.#requestRender()
    }
  }

  #scheduleWindowRebuild(): void {
    if (this.#pendingWindowRebuild) return
    this.#pendingWindowRebuild = true
    requestAnimationFrame(() => {
      if (this.#disposed) return
      this.#renderLines()
      this.#applyScroll()
      this.#requestRender()
    })
  }

  #attachKeyListener(): void {
    if (this.#keyHandler !== null) return
    // tabIndex нужен чтобы canvas получал focus и стрелки работали.
    if (this.#canvas.tabIndex < 0) this.#canvas.tabIndex = 0
    const handler = (event: KeyboardEvent): void => {
      if (this.#current === null) return
      const visible = this.#visibleLineCount()
      let handled = true
      switch (event.key) {
        case "ArrowDown": this.#setScroll(this.#scrollOffset + 1); break
        case "ArrowUp": this.#setScroll(this.#scrollOffset - 1); break
        case "PageDown": this.#setScroll(this.#scrollOffset + visible); break
        case "PageUp": this.#setScroll(this.#scrollOffset - visible); break
        case "Home": this.#setScroll(0); break
        case "End": this.#setScroll(this.#totalLines); break
        case "g":
          // 'g' = "go to current execution line" (как F2 в WebStorm).
          if (this.#current.currentLine > 0) {
            this.#setScroll(this.#current.currentLine - 1 - Math.floor(visible / 2))
          }
          break
        default: handled = false
      }
      if (handled) event.preventDefault()
    }
    this.#canvas.addEventListener("keydown", handler)
    this.#keyHandler = handler
  }

  #detachKeyListener(): void {
    if (this.#keyHandler !== null) {
      this.#canvas.removeEventListener("keydown", this.#keyHandler)
      this.#keyHandler = null
    }
  }

  // Тонкий scrollbar справа: track всегда видимый, thumb позиционируется
  // по scrollOffset. При файлах < visibleLines скрыт.
  #updateScrollbar(): void {
    if (this.#current === null) return
    const visible = this.#visibleLineCount()
    if (this.#totalLines <= visible) {
      if (this.#scrollbarTrack !== null) this.#scrollbarTrack.visible = false
      if (this.#scrollbarThumb !== null) this.#scrollbarThumb.visible = false
      return
    }
    const trackWidthPx = 4
    const trackWidthWorld = trackWidthPx * this.#pixelScale
    const trackHeightWorld = this.#contentPixelHeight * this.#pixelScale
    const trackXPx = this.#contentPixelWidth - trackWidthPx
    const trackXWorld = trackXPx * this.#pixelScale + trackWidthWorld / 2

    if (this.#scrollbarTrack === null) {
      this.#scrollbarTrack = new Mesh(
        new PlaneGeometry({width: trackWidthWorld, height: trackHeightWorld}),
        new MeshBasicMaterial({color: new Color(48 / 255, 54 / 255, 61 / 255, 0.6)}),
      )
      this.#scrollbarTrack.position.z = 0.0015
      this.#contentContainer.add(this.#scrollbarTrack)
    } else {
      this.#scrollbarTrack.geometry = new PlaneGeometry({width: trackWidthWorld, height: trackHeightWorld})
    }
    this.#scrollbarTrack.visible = true
    this.#scrollbarTrack.position.x = trackXWorld
    this.#scrollbarTrack.position.y = -trackHeightWorld / 2
    this.#scrollbarTrack.updateMatrix()

    const thumbRatio = visible / this.#totalLines
    const thumbHeightWorld = Math.max(trackWidthWorld * 4, trackHeightWorld * thumbRatio)
    const scrollProgress = this.#totalLines === visible
      ? 0
      : this.#scrollOffset / (this.#totalLines - visible)
    const thumbCenterY = -(thumbHeightWorld / 2 +
      (trackHeightWorld - thumbHeightWorld) * scrollProgress)

    if (this.#scrollbarThumb === null) {
      this.#scrollbarThumb = new Mesh(
        new PlaneGeometry({width: trackWidthWorld, height: thumbHeightWorld}),
        new MeshBasicMaterial({color: new Color(110 / 255, 118 / 255, 129 / 255, 0.85)}),
      )
      this.#scrollbarThumb.position.z = 0.0016
      this.#contentContainer.add(this.#scrollbarThumb)
    } else {
      this.#scrollbarThumb.geometry = new PlaneGeometry({width: trackWidthWorld, height: thumbHeightWorld})
    }
    this.#scrollbarThumb.visible = true
    this.#scrollbarThumb.position.x = trackXWorld
    this.#scrollbarThumb.position.y = thumbCenterY
    this.#scrollbarThumb.updateMatrix()
  }

  #detachWheelListener(): void {
    if (this.#wheelHandler !== null) {
      this.#canvas.removeEventListener("wheel", this.#wheelHandler)
      this.#wheelHandler = null
    }
  }

  // Window rendering: создаём Text только для [windowStart .. windowStart + windowSize)
  // строк. Scroll внутри окна — translate codeContainer.position.y. Когда
  // scrollOffset уходит за пределы window, пересобираем (через RAF throttle).
  // Это держит число Text-объектов в пределах MAX_RENDERABLES движка и
  // обеспечивает мгновенный wheel-scroll внутри overscan.
  #renderLines(): Object3D[] {
    this.#codeContainer.children = []
    this.#hideGutterRule()

    if (this.#current === null) {
      this.#totalLines = 0
      return []
    }
    const lines = this.#current.lines
    const currentLine = this.#current.currentLine
    if (lines.length === 0) {
      this.#totalLines = 0
      return []
    }

    this.#totalLines = lines.length
    const visible = this.#visibleLineCount()
    this.#scrollOffset = Math.max(
      0,
      Math.min(this.#scrollOffset, Math.max(0, lines.length - visible)),
    )
    // Window: visible + overscan по обеим сторонам, ограниченный длиной файла
    // и движковым лимитом MAX_RENDERED_LINES.
    this.#windowSize = Math.min(
      lines.length,
      MAX_RENDERED_LINES,
      visible + 2 * OVERSCAN_LINES,
    )
    this.#windowStart = Math.max(
      0,
      Math.min(
        lines.length - this.#windowSize,
        this.#scrollOffset - OVERSCAN_LINES,
      ),
    )
    const windowEnd = this.#windowStart + this.#windowSize

    const lineFontWorld = lineFontWorldFor(this.#pixelScale)
    const gutterPx = this.#gutterWidthPx(lines.length)
    const codeWidthPx = Math.max(1, this.#contentPixelWidth - gutterPx)
    this.#syncGutterRule(gutterPx)

    void codeWidthPx
    const contentWorldW = this.#contentPixelWidth * this.#pixelScale
    const highlightWorldH = LINE_PX * this.#pixelScale

    // Render только строки в окне [windowStart..windowEnd). Локальный y у
    // каждой строки отсчитывается от windowStart (i=0 → top). codeContainer
    // двигается на (scrollOffset - windowStart) * LINE_PX * scale в applyScroll.
    for (let i = 0; i < windowEnd - this.#windowStart; i++) {
      const lineIndex = this.#windowStart + i
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
        // Высокий зазор — depth precision в perspective очень низкий вблизи
        // near plane. Background.z = -0.02 (далеко), highlight.z = -0.005
        // в codeContainer (world ~ -0.003), text/arrow.z = 0 (world ~ +0.002).
        hl.position.z = -0.005
        hl.updateMatrix()
        this.#codeContainer.add(hl)
      }

      const numStr = String(lineNo)
      const numMaterial = isCurrent ? this.#gutterHotMaterial : this.#gutterMaterial
      const numText = new Text(numStr, this.#font, lineFontWorld, numMaterial)
      numText.name = "gutter"
      numText.position.x = this.#lineNumberX(numStr, gutterPx, lineFontWorld)
      numText.position.y = baselineY
      numText.updateMatrix()
      this.#codeContainer.add(numText)

      if (isCurrent) {
        // IntelliJ "Execution Point": стрелка ▶ перед номером строки.
        const arrow = new Text("▶", this.#font, lineFontWorld * 0.9, this.#execArrowMaterial)
        arrow.name = "arrow"
        arrow.position.x = (GUTTER_LEFT_PAD_PX * 0.4) * this.#pixelScale
        arrow.position.y = baselineY
        arrow.updateMatrix()
        this.#codeContainer.add(arrow)
      }

      if (text.trim().length > 0) {
        const trimmed = text.length > 200 ? `${text.slice(0, 199)}…` : text
        const codeStartX = (gutterPx + CODE_LEFT_PAD_PX) * this.#pixelScale
        const lineTokens = this.#current.tokens?.[lineIndex]
        if (lineTokens !== undefined && lineTokens.length > 0) {
          this.#renderTokenizedLine(trimmed, lineTokens, codeStartX, baselineY, lineFontWorld)
        } else {
          const lineText = new Text(trimmed, this.#font, lineFontWorld, this.#lineMaterial)
          lineText.name = "code"
          lineText.position.x = codeStartX
          lineText.position.y = baselineY
          lineText.updateMatrix()
          this.#codeContainer.add(lineText)
        }
      }
    }
    this.#pendingWindowRebuild = false
    return [...this.#codeContainer.children]
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
      const width = measureTextWorld(chunkText, this.#font, fontSize)
      // Whitespace-only чанки не дают glyph-геометрии (Text внутри пропускает
      // ' ' через continue), Mesh.draw(0) вызывает WebGPU warning. Пропускаем
      // создание Text, но advance cursor правильно сохраняем.
      if (chunkText.trim().length === 0) {
        cursorX += width
        return
      }
      const material = this.#tokenMaterials.get(category) ?? this.#lineMaterial
      const t = new Text(chunkText, this.#font, fontSize, material)
      t.name = "code"
      t.position.x = cursorX
      t.position.y = baselineY
      t.updateMatrix()
      this.#codeContainer.add(t)
      cursorX += width
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

function stripLine(location: string | undefined): string {
  if (location === undefined) return ""
  // location формат `${url}:${line}`. Отрезаем `:line` для file-identity.
  const idx = location.lastIndexOf(":")
  if (idx < 0) return location
  return location.slice(0, idx)
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
