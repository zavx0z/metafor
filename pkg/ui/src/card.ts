/**
 * Card — базовый class для UI-карточек поверх UiCanvas.
 *
 * ГАРАНТИИ:
 *  • Background и border всегда внутри card-rect — не вылазят за границы.
 *  • Bg/border меши ВЛАДЕНЫ Card. Subclass их не трогает.
 *  • drawText обрезается через ИЗМЕРЕНИЕ font.getHMetric (font advance +
 *    letterSpacing 5%) — точное, не estimate. Бинарный поиск с "...".
 *  • drawTextCentered учитывает реальный bbox глифа (yMin/yMax из
 *    TrueTypeFont.getGlyphBounds), а не cap-box — корректно центрирует
 *    математические символы, guillemets и т.п.
 *  • drawRect клампится к card-bounds.
 *  • Mesh.parent ВСЕГДА выставляется через Object3D.add() (не unshift).
 *  • Между renderами #layer пересобирается; геометрии возвращаются
 *    в renderer.invalidateGeometry().
 *
 * Z-СТЕК (микро-z, чтобы perspective-divide не сдвигал bg/text):
 *   bg     -0.0002
 *   border -0.0001
 *   layer    0.0
 *   Z.SEPARATOR    +0.00002
 *   Z.ELEMENT      +0.00004
 *   Z.ELEMENT_RULE +0.00006
 *   Z.TEXT         +0.00008
 *
 * При больших Δz parallax между bg и контентом виден на смещённых от
 * центра канваса карточках (1/(camDist - z) сильно меняется).
 *
 * PADDING:
 *   Опция CardOpts.padding (число px или {top,right,bottom,left}) даёт
 *   inner-rect отступ. drawText/drawRect/hit/clipStack работают в координатах
 *   inner-rect [0..innerW]×[0..innerH] (где innerW = rect.w − padLeft − padRight),
 *   а bg и border рисуются по полному card-rect.
 *
 *   Пример (комбо с flexRow):
 *
 *     class Toolbar extends Card {
 *       constructor() { super({ padding: 12 }) }
 *       protected render() {
 *         flexRow({
 *           x: 0, y: 0, w: this.rectW, h: this.rectH,
 *           justifyContent: "space-between", alignItems: "center",
 *           items: [
 *             {width: 120, height: 32, draw: (x,y,w,h) =>
 *               button(this, x, y, w, h, {label: "Save", action})},
 *             {width: 32,  height: 32, draw: (x,y,w,h) =>
 *               circleButton(this, x + w/2, y + h/2, Math.min(w,h)/2,
 *                 {label: "+", action})},
 *           ],
 *         })
 *       }
 *     }
 */

import {
  Color,
  ImageMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RoundedRectMaterial,
  Text,
  TextMaterial,
  TexturedPlaneGeometry,
  TrueTypeFont,
  TextureLoader,
  type BufferGeometry,
  type ImageFit,
  type ImageViewBox as EngineImageViewBox,
} from "@metafor/engine"
import type {CardRect, UiCanvas, UiCard} from "./canvas.ts"
import {MaterialPalette} from "./theme.ts"

export type HitBox = {
  x: number
  y: number
  w: number
  h: number
  action(): void
  cursor: string
}

export type CardPadding = number | {top?: number; right?: number; bottom?: number; left?: number}

export type CardOpts = {
  bgColor?: Color | null
  /** null = без рамки. Default — серая 1px. */
  borderColor?: Color | null
  borderWidthPx?: number
  /**
   * Внутренние отступы в logical px. drawText/drawRect/hit/flex работают в
   * inner rect [0..innerW]×[0..innerH], где innerW = rect.w - padLeft - padRight,
   * innerH = rect.h - padTop - padBottom. bg и border рисуются по полному rect
   * (snug к canvas slot), а контент Card сдвинут внутрь.
   *
   * Можно задать число (uniform) или per-side объект.
   * Default 0.
   */
  padding?: CardPadding
}

export type ImageViewBox = EngineImageViewBox

export type DrawImageOpts = {
  fit?: ImageFit
  opacity?: number
  viewBox?: ImageViewBox
  z?: number
}

export type BackgroundImageOpts = {
  src: string
  fit?: ImageFit
  opacity?: number
  viewBox?: ImageViewBox
  /** 0..1 — масштаб bg-image относительно Card-rect; центрируется.
   *  1 = заполнить, 0.8 = 80% размера с 10% полем по краям. Default 1. */
  scale?: number
}

export type DrawTextOpts = {
  fontPx: number
  material: TextMaterial
  /** Гарантия: текст обрезается через измерение и "...". */
  maxWidthPx?: number
  z?: number
}

export type TextBlockAlign = "left" | "center" | "right"
export type TextBlockVAlign = "top" | "middle" | "bottom"

export type DrawTextBlockOpts = {
  /** Reference-px if Card.referenceHeight is set, otherwise canvas-px. */
  fontPx?: number
  material: TextMaterial
  lineHeight?: number
  align?: TextBlockAlign
  vAlign?: TextBlockVAlign
  padX?: number
  padY?: number
  padTop?: number
  padRight?: number
  padBottom?: number
  padLeft?: number
  upper?: boolean
  wrap?: boolean
  fit?: "none" | "shrink"
  minFontPx?: number
  maxLines?: number
  z?: number
}

export type TextBlockMetrics = {
  lines: string[]
  fontPx: number
  lineHeightPx: number
  totalHeightPx: number
  maxLineWidthPx: number
}

// Card по умолчанию ПРОЗРАЧНА: ни заливки, ни border'а. Чтобы вернуть
// «классическую» тёмную карточку с обводкой — передайте bgColor/borderColor
// явно в CardOpts (см. примеры в playground'е). null отключает явно.
const DEFAULT_BG: Color | null = null
const DEFAULT_BORDER: Color | null = null

export const Z: {
  readonly CONTAINER: number
  readonly SEPARATOR: number
  readonly ELEMENT: number
  readonly ELEMENT_RULE: number
  readonly TEXT: number
} = {
  CONTAINER: 0,
  SEPARATOR: 0.00002,
  ELEMENT: 0.00004,
  ELEMENT_RULE: 0.00006,
  TEXT: 0.00008,
}

export abstract class Card implements UiCard {
  readonly node = new Object3D()
  /** Готовый набор TextMaterial'ов с palette-цветами. Reuse, не GC-friendly create. */
  readonly materials = new MaterialPalette()
  protected canvas: UiCanvas | null = null
  protected font: TrueTypeFont | null = null
  protected pixelScale = 0.001
  protected rectW = 1
  protected rectH = 1
  /**
   * Reference-height: если задан, то `opts.fontPx` в `drawText` /
   * `drawTextCentered` / `measureText` интерпретируется как пиксели
   * в reference-системе (например, журнальная страница 1055px), а не
   * как canvas-px. Внутри умножаем на `rectH / referenceHeight`,
   * чтобы шрифт пропорционально масштабировался при ресайзе card.
   * Default = null → fontPx считаем canvas-px (старое поведение).
   */
  protected referenceHeight: number | null = null

  /** Коэффициент масштабирования fontPx из reference в canvas-px.
   *  Публичен — внешний код (renderText, шаблоны pageTemplates) может
   *  применять scale к line-height и любой fontPx-арифметике, чтобы
   *  расстояния между строками и blockH тоже скейлились пропорционально.
   *  При referenceHeight=null всегда 1. */
  get pageScale(): number {
    return this.referenceHeight === null ? 1 : this.rectH / this.referenceHeight
  }

  /** Внутренний alias для pageScale — используется в drawText/measureText. */
  protected get pageScaleFactor(): number {
    return this.pageScale
  }

  readonly #bg: Mesh | null
  readonly #borderTop: Mesh | null
  readonly #borderBottom: Mesh | null
  readonly #borderLeft: Mesh | null
  readonly #borderRight: Mesh | null
  readonly #borderWidthPx: number
  readonly #backgroundLayer: Object3D
  readonly #layer: Object3D
  /** Padding в logical px (top, right, bottom, left). */
  readonly #padTop: number
  readonly #padRight: number
  readonly #padBottom: number
  readonly #padLeft: number
  #hits: HitBox[] = []
  protected hoveredHit: HitBox | null = null
  protected pressedHit: HitBox | null = null
  #backgroundImage: BackgroundImageOpts | null = null

  /** Top-left corner of card on canvas в logical-px (для конверсии в screen-px). */
  #screenOriginX = 0
  #screenOriginY = 0
  #fullRectW = 1
  #fullRectH = 1
  readonly #requestRenderOnImageLoad = (): void => {
    this.requestRender()
  }
  /** Стек clip-rect'ов в Card-local-px. Первый элемент = вся Card-rect. */
  #clipStack: Array<{xMin: number; yMin: number; xMax: number; yMax: number}> = []

  constructor(opts: CardOpts = {}) {
    const bgColor = opts.bgColor === null ? null : opts.bgColor ?? DEFAULT_BG
    const borderColor = opts.borderColor === null ? null : opts.borderColor ?? DEFAULT_BORDER
    this.#borderWidthPx = opts.borderWidthPx ?? 1

    const p = opts.padding
    if (typeof p === "number") {
      this.#padTop = this.#padRight = this.#padBottom = this.#padLeft = Math.max(0, p)
    } else if (p) {
      this.#padTop = Math.max(0, p.top ?? 0)
      this.#padRight = Math.max(0, p.right ?? 0)
      this.#padBottom = Math.max(0, p.bottom ?? 0)
      this.#padLeft = Math.max(0, p.left ?? 0)
    } else {
      this.#padTop = this.#padRight = this.#padBottom = this.#padLeft = 0
    }

    this.node.name = this.constructor.name

    if (bgColor !== null) {
      this.#bg = new Mesh(new PlaneGeometry({width: 1, height: 1}), new MeshBasicMaterial({color: bgColor}))
      this.#bg.name = `${this.constructor.name}.bg`
      this.#bg.position.z = -0.0002
      this.node.add(this.#bg)
    } else {
      this.#bg = null
    }

    if (borderColor !== null) {
      const borderMat = new MeshBasicMaterial({color: borderColor})
      this.#borderTop = mkMesh(`${this.constructor.name}.borderTop`, borderMat)
      this.#borderBottom = mkMesh(`${this.constructor.name}.borderBottom`, borderMat)
      this.#borderLeft = mkMesh(`${this.constructor.name}.borderLeft`, borderMat)
      this.#borderRight = mkMesh(`${this.constructor.name}.borderRight`, borderMat)
      for (const m of [this.#borderTop, this.#borderBottom, this.#borderLeft, this.#borderRight]) {
        m.position.z = -0.0001
        this.node.add(m)
      }
    } else {
      this.#borderTop = null
      this.#borderBottom = null
      this.#borderLeft = null
      this.#borderRight = null
    }

    this.#backgroundLayer = new Object3D()
    this.#backgroundLayer.name = `${this.constructor.name}.backgroundLayer`
    this.#backgroundLayer.position.z = 0
    this.node.add(this.#backgroundLayer)

    this.#layer = new Object3D()
    this.#layer.name = `${this.constructor.name}.layer`
    this.#layer.position.z = 0
    this.node.add(this.#layer)
  }

  attachCanvas(canvas: UiCanvas): void {
    this.canvas = canvas
  }

  setBackgroundImage(options: BackgroundImageOpts | null): void {
    if (options === null) {
      this.#backgroundImage = null
    } else {
      const next: BackgroundImageOpts = {
        src: options.src,
      }
      if (options.fit !== undefined) next.fit = options.fit
      if (options.opacity !== undefined) next.opacity = options.opacity
      if (options.scale !== undefined) next.scale = options.scale
      if (options.viewBox !== undefined) next.viewBox = { ...options.viewBox }
      this.#backgroundImage = next
    }
    this.requestRender()
  }

  setRect(rect: CardRect, pixelScale: number, font: TrueTypeFont): void {
    this.font = font
    this.pixelScale = pixelScale
    // rectW/rectH — это INNER размер (минус padding со всех сторон).
    // bg/border внутри #syncChrome рисуются по полному rect.w/rect.h.
    this.#fullRectW = rect.w
    this.#fullRectH = rect.h
    const innerW = Math.max(1, rect.w - this.#padLeft - this.#padRight)
    const innerH = Math.max(1, rect.h - this.#padTop - this.#padBottom)
    this.rectW = innerW
    this.rectH = innerH
    // screenOrigin — для hit-mapping. Pointermove приходит в card-rect-local
    // (UiCanvas вычитает rect.x/y), и мы дополнительно вычитаем padding в
    // onPointerMove/Down/Up перед #hitAt.
    this.#screenOriginX = rect.x
    this.#screenOriginY = rect.y
    // Сдвигаем #layer на padLeft/padTop, чтобы локальные draw-координаты
    // [0..innerW] оказались в правильном месте canvas.
    this.#layer.position.x = this.#padLeft * pixelScale
    this.#layer.position.y = -this.#padTop * pixelScale
    this.#layer.updateMatrix()
    this.#syncChrome(rect.w, rect.h)
    this.#rerender()
  }

  /** Subclass зовёт при изменении state — re-render без resize. */
  protected requestRender(): void {
    if (this.font === null) return
    this.#rerender()
    this.canvas?.requestRender()
  }

  /** Subclass рисует контент. Вызывается ТОЛЬКО когда font установлен. */
  protected abstract render(): void

  // ────────────────────────── Primitives ──────────────────────────

  /**
   * Рисует текст. maxWidthPx — гарантия обрезки через измерение
   * font-метрик. Возвращает фактическую ширину в logical px.
   */
  drawText(value: string, x: number, y: number, opts: DrawTextOpts): number {
    if (this.font === null) return 0
    const maxPx = opts.maxWidthPx ?? Infinity
    if (maxPx <= 0) return 0
    const fitted = this.#fitText(value, maxPx, opts.fontPx)
    if (fitted.length === 0) return 0
    // fontPx — в reference-px (если referenceHeight задан); приводим к
    // canvas-px через pageScaleFactor для размера текста и y-сдвига.
    const fontPxCanvas = opts.fontPx * this.pageScaleFactor
    const text = new Text(fitted, this.font, fontPxCanvas * this.pixelScale, opts.material)
    text.position.x = x * this.pixelScale
    // y — top-of-cap (canvas-px). Baseline ≈ y + fontPxCanvas.
    text.position.y = -(y + fontPxCanvas) * this.pixelScale
    text.position.z = opts.z ?? Z.TEXT
    text.updateMatrix()
    this.#applyClipTo(text)
    this.#layer.add(text)
    return this.measureText(fitted, opts.fontPx)
  }

  /**
   * Deterministic multi-line text inside a fixed box.
   *
   * `drawText` deliberately draws one line at a top-left point. For layouts,
   * use this method instead: font size, line-height and fitting are resolved
   * in one place, using the same reference-height scaling as `drawText`.
   */
  drawTextBlock(
    value: string | readonly string[],
    x: number,
    y: number,
    w: number,
    h: number,
    opts: DrawTextBlockOpts,
  ): TextBlockMetrics {
    const layout = this.#layoutTextBlock(value, w, h, opts)
    if (layout.lines.length === 0) return layout

    const pad = textBlockPadding(opts)
    const innerX = x + pad.left
    const innerY = y + pad.top
    const innerW = Math.max(0, w - pad.left - pad.right)
    const innerH = Math.max(0, h - pad.top - pad.bottom)
    if (innerW <= 0 || innerH <= 0) return layout

    let cy = innerY
    if (opts.vAlign === "bottom") cy += Math.max(0, innerH - layout.totalHeightPx)
    else if (opts.vAlign !== "top") cy += Math.max(0, (innerH - layout.totalHeightPx) / 2)

    for (const line of layout.lines) {
      const lineW = this.measureText(line, layout.fontPx)
      let tx = innerX
      if (opts.align === "right") tx = innerX + innerW - lineW
      else if (opts.align === "center") tx = innerX + (innerW - lineW) / 2
      if (line.length > 0) {
        const drawOpts: DrawTextOpts = {
          fontPx: layout.fontPx,
          material: opts.material,
          maxWidthPx: innerW,
        }
        if (opts.z !== undefined) drawOpts.z = opts.z
        this.drawText(line, tx, cy, drawOpts)
      }
      cy += layout.lineHeightPx
    }
    return layout
  }

  measureTextBlock(value: string | readonly string[], w: number, h: number, opts: DrawTextBlockOpts): TextBlockMetrics {
    return this.#layoutTextBlock(value, w, h, opts)
  }

  /**
   * Рисует текст так, чтобы его **визуальный** bounding-box (по реальным
   * yMin/yMax глифа, а не cap-box) был отцентрирован относительно (cx, cy).
   *
   * Решает классическую проблему drawText: для математических операторов
   * («+», «−», «±»), guillemets («‹», «›»), знаков и прочих non-cap-letter
   * глифов центр cap-box ≠ визуальному центру. drawTextCentered измеряет
   * реальный bbox через `font.getGlyphBounds(gid)` и сдвигает baseline так,
   * чтобы (yMax + yMin)/2 совпал с cy.
   *
   * Возвращает фактическую ширину текста в logical px.
   */
  drawTextCentered(value: string, cx: number, cy: number, opts: DrawTextOpts): number {
    if (this.font === null) return 0
    const f = this.font
    const fontPx = opts.fontPx
    // fontPxCanvas — реальный размер в canvas-px (учёт pageScaleFactor).
    const fontPxCanvas = fontPx * this.pageScaleFactor
    const scale = fontPxCanvas / f.unitsPerEm

    // Объединённый bbox строки в font-units (Y вверх от baseline).
    let yMin = Infinity
    let yMax = -Infinity
    for (const ch of value) {
      if (ch === " ") continue
      const gid = f.mapCharToGlyph(ch.codePointAt(0)!)
      const b = f.getGlyphBounds(gid)
      if (b.yMin === 0 && b.yMax === 0) continue
      if (b.yMin < yMin) yMin = b.yMin
      if (b.yMax > yMax) yMax = b.yMax
    }
    // Если все глифы пустые (пробелы) — fallback на cap-box центр (canvas-px).
    const visualCenter = isFinite(yMin) && isFinite(yMax) ? ((yMax + yMin) / 2) * scale : fontPxCanvas / 2

    const labelW = this.measureText(value, fontPx)
    // baseline должен быть на cy + visualCenter (visualCenter — высота над baseline).
    // drawText: y = baseline - fontPxCanvas → y = cy + visualCenter - fontPxCanvas.
    const drawX = cx - labelW / 2
    const drawY = cy + visualCenter - fontPxCanvas
    return this.drawText(value, drawX, drawY, opts)
  }

  /**
   * Рисует прямоугольник в pixel-coords. Клампится к текущему clip-rect
   * (push/popClip) — для drawRect используем JS-кламп, не шейдер: rect-меши
   * (MeshBasicMaterial) идут через mesh-pipeline и не имеют clipBounds.
   */
  drawRect(x: number, y: number, w: number, h: number, color: Color, z = Z.CONTAINER): void {
    const clip = this.#clipStack[this.#clipStack.length - 1]!
    const x0 = Math.max(clip.xMin, x)
    const y0 = Math.max(clip.yMin, y)
    const x1 = Math.min(clip.xMax, x + w)
    const y1 = Math.min(clip.yMax, y + h)
    const cw = x1 - x0
    const ch = y1 - y0
    if (cw <= 0 || ch <= 0) return
    const mesh = new Mesh(
      new PlaneGeometry({width: cw * this.pixelScale, height: ch * this.pixelScale}),
      new MeshBasicMaterial({color}),
    )
    mesh.position.x = (x0 + cw / 2) * this.pixelScale
    mesh.position.y = -(y0 + ch / 2) * this.pixelScale
    mesh.position.z = z
    mesh.updateMatrix()
    this.#layer.add(mesh)
  }

  drawImage(src: string, x: number, y: number, w: number, h: number, opts: DrawImageOpts = {}): void {
    this.#drawImageMesh(this.#layer, src, x, y, w, h, opts, opts.z ?? Z.ELEMENT, true)
  }

  /**
   * Скруглённый прямоугольник (или круг — если radius=min(w,h)/2 и фигура
   * квадратная) с pixel-perfect SDF-AA в шейдере. Идёт через RoundedRectMaterial
   * — без strip-loop'ов, лесенки на углах нет.
   *
   * Клиппинг работает через шейдер (clipBounds в screen-px), не через JS-кламп —
   * иначе обрезанный край терял бы скругление.
   */
  drawRoundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    opts: {
      radius: number | {tl: number; tr: number; br: number; bl: number}
      fill?: Color | null
      border?: Color | null
      borderWidth?: number
      opacity?: number
      z?: number
    },
  ): void {
    if (w <= 0 || h <= 0) return
    const ps = this.pixelScale
    const material = new RoundedRectMaterial({
      width: w * ps,
      height: h * ps,
      radius:
        typeof opts.radius === "number"
          ? opts.radius * ps
          : {tl: opts.radius.tl * ps, tr: opts.radius.tr * ps, br: opts.radius.br * ps, bl: opts.radius.bl * ps},
      fill: opts.fill ?? null,
      border: opts.border ?? null,
      borderWidth: (opts.borderWidth ?? 0) * ps,
      opacity: opts.opacity ?? 1,
    })
    this.#applyRoundedClipTo(material)
    const mesh = new Mesh(new PlaneGeometry({width: w * ps, height: h * ps}), material)
    mesh.position.x = (x + w / 2) * ps
    mesh.position.y = -(y + h / 2) * ps
    mesh.position.z = opts.z ?? Z.ELEMENT
    mesh.updateMatrix()
    this.#layer.add(mesh)
  }

  /** Точное измерение ширины текста через font advance + letter-spacing.
   *  fontPx интерпретируется как reference-px (если referenceHeight задан) —
   *  возвращаемая ширина уже в canvas-px (после умножения на pageScaleFactor).
   */
  measureText(value: string, fontPx: number): number {
    if (this.font === null) return 0
    const f = this.font
    const fontPxCanvas = fontPx * this.pageScaleFactor
    const scale = fontPxCanvas / f.unitsPerEm
    const letterSpacing = fontPxCanvas * 0.05
    let w = 0
    for (const ch of value) {
      if (ch === " ") {
        w += f.unitsPerEm * 0.3 * scale
        continue
      }
      const gid = f.mapCharToGlyph(ch.codePointAt(0)!)
      const m = f.getHMetric(gid)
      w += m.advanceWidth * scale + letterSpacing
    }
    return w
  }

  /** Регистрирует hit-rect в card-px coords. Поздние побеждают. */
  hit(x: number, y: number, w: number, h: number, action: () => void, cursor = "pointer"): void {
    this.#hits.push({x, y, w, h, action, cursor})
  }

  // ────────────────────────── Pointer events ──────────────────────────

  onPointerMove(_event: MouseEvent, localX: number, localY: number): void {
    if (this.canvas === null) return
    // Pointermove приходит в card-rect-local; #hits зарегистрированы в inner-coords
    // (после сдвига на padding) — субтрагируем padLeft/padTop.
    const hit = this.#hitAt(localX - this.#padLeft, localY - this.#padTop)
    this.canvas.canvas.style.cursor = hit?.cursor ?? "default"
    if (hit === this.hoveredHit) return
    this.hoveredHit = hit
  }

  onPointerDown(_event: MouseEvent, localX: number, localY: number): void {
    const hit = this.#hitAt(localX - this.#padLeft, localY - this.#padTop)
    if (hit === null) return
    this.pressedHit = hit
    hit.action()
  }

  onPointerUp(_event: MouseEvent, _localX: number, _localY: number): void {
    if (this.pressedHit === null) return
    this.pressedHit = null
  }

  onDeactivate(): void {
    if (this.canvas !== null) this.canvas.canvas.style.cursor = "default"
    this.hoveredHit = null
    this.pressedHit = null
  }

  dispose(): void {
    this.#clearLayer()
    this.#clearLayer(this.#backgroundLayer)
  }

  // ────────────────────────── Internal ──────────────────────────

  #syncChrome(fullW = this.rectW + this.#padLeft + this.#padRight, fullH = this.rectH + this.#padTop + this.#padBottom): void {
    const ps = this.pixelScale
    const w = fullW
    const h = fullH

    if (this.#bg !== null) {
      this.#replaceGeometry(this.#bg, new PlaneGeometry({width: w * ps, height: h * ps}))
      this.#bg.position.x = (w / 2) * ps
      this.#bg.position.y = -(h / 2) * ps
      this.#bg.updateMatrix()
    }

    if (this.#borderTop !== null) {
      const bw = this.#borderWidthPx
      const bwWorld = bw * ps
      const wWorld = w * ps
      const hWorld = h * ps
      this.#replaceGeometry(this.#borderTop, new PlaneGeometry({width: wWorld, height: bwWorld}))
      this.#borderTop.position.x = wWorld / 2
      this.#borderTop.position.y = -bwWorld / 2
      this.#borderTop.updateMatrix()
      this.#replaceGeometry(this.#borderBottom!, new PlaneGeometry({width: wWorld, height: bwWorld}))
      this.#borderBottom!.position.x = wWorld / 2
      this.#borderBottom!.position.y = -hWorld + bwWorld / 2
      this.#borderBottom!.updateMatrix()
      this.#replaceGeometry(this.#borderLeft!, new PlaneGeometry({width: bwWorld, height: hWorld}))
      this.#borderLeft!.position.x = bwWorld / 2
      this.#borderLeft!.position.y = -hWorld / 2
      this.#borderLeft!.updateMatrix()
      this.#replaceGeometry(this.#borderRight!, new PlaneGeometry({width: bwWorld, height: hWorld}))
      this.#borderRight!.position.x = wWorld - bwWorld / 2
      this.#borderRight!.position.y = -hWorld / 2
      this.#borderRight!.updateMatrix()
    }
  }

  #replaceGeometry(mesh: Mesh, next: BufferGeometry): void {
    const previous = mesh.geometry
    if (previous !== next) this.canvas?.renderer.invalidateGeometry(previous)
    mesh.geometry = next
  }

  #rerender(): void {
    this.#clearLayer(this.#backgroundLayer)
    if (this.#backgroundImage !== null) {
      const scale = this.#backgroundImage.scale ?? 1
      const bgW = this.#fullRectW * scale
      const bgH = this.#fullRectH * scale
      const bgX = (this.#fullRectW - bgW) / 2
      const bgY = (this.#fullRectH - bgH) / 2
      this.#drawImageMesh(
        this.#backgroundLayer,
        this.#backgroundImage.src,
        bgX,
        bgY,
        bgW,
        bgH,
        this.#backgroundImage,
        -0.00018,
        false,
      )
    }
    this.#clearLayer()
    this.#hits = []
    this.#clipStack = [{xMin: 0, yMin: 0, xMax: this.rectW, yMax: this.rectH}]
    this.render()
  }

  #drawImageMesh(
    parent: Object3D,
    src: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: DrawImageOpts,
    z: number,
    clipToCurrent: boolean,
  ): void {
    if (!src || w <= 0 || h <= 0) return
    const viewBox = normaliseViewBox(opts.viewBox)
    // Пока texture status !== "ready" — image-mesh всё равно создаётся и
    // использует TextureLoader.fallback() (1×1 прозрачную текстуру), поэтому
    // место под image полностью прозрачно. Никакого placeholder rect под ним
    // не рисуем: раньше там был dark fill + 4 line-rect'a по периметру
    // (IMAGE_PLACEHOLDER_LINE = gold с alpha 0.3), что давало flash «пустых
    // золотых рамок» по всему layout — вокруг каждой фотографии, иконки,
    // логотипа и т.п. при холодной загрузке. Когда status → "ready",
    // onTextureChange → requestRender → next frame подхватит настоящую
    // текстуру в тот же mesh.

    const material = new ImageMaterial({
      src,
      fit: opts.fit ?? "cover",
      opacity: opts.opacity ?? 1,
      viewBox,
      boxAspect: w / h,
      onTextureChange: this.#requestRenderOnImageLoad,
    })
    if (clipToCurrent) this.#applyImageClipTo(material)
    const mesh = new Mesh(
      new TexturedPlaneGeometry({width: w * this.pixelScale, height: h * this.pixelScale}),
      material,
    )
    mesh.position.x = (x + w / 2) * this.pixelScale
    mesh.position.y = -(y + h / 2) * this.pixelScale
    mesh.position.z = z
    mesh.updateMatrix()
    parent.add(mesh)
  }

  /**
   * Сужает текущий clip-rect на пересечение с (x, y, w, h) в Card-local-px.
   * Все последующие drawText будут клипаться по этому rect'у в шейдере.
   * Пара push/pop обязательна. drawRect клампится в JS, на него clip-stack
   * не влияет (см. drawRect).
   */
  pushClip(x: number, y: number, w: number, h: number): void {
    const top = this.#clipStack[this.#clipStack.length - 1]!
    this.#clipStack.push({
      xMin: Math.max(top.xMin, x),
      yMin: Math.max(top.yMin, y),
      xMax: Math.min(top.xMax, x + w),
      yMax: Math.min(top.yMax, y + h),
    })
  }

  popClip(): void {
    if (this.#clipStack.length > 1) this.#clipStack.pop()
  }

  #applyClipTo(text: Text): void {
    const clip = this.#clipStack[this.#clipStack.length - 1]!
    // Screen-pixel scissor (framebuffer-pixels). gl_FragCoord уже учитывает
    // pixelRatio и projection — конвертируем card-local-logical-px в
    // physical-px через pixelRatio renderer'а.
    const dpr = this.canvas?.renderer.pixelRatio ?? 1
    const ox = this.#screenOriginX
    const oy = this.#screenOriginY
    text.clipBounds = [
      (ox + clip.xMin) * dpr,
      (oy + clip.yMin) * dpr,
      (ox + clip.xMax) * dpr,
      (oy + clip.yMax) * dpr,
    ]
  }

  #applyImageClipTo(material: ImageMaterial): void {
    const clip = this.#clipStack[this.#clipStack.length - 1]!
    const dpr = this.canvas?.renderer.pixelRatio ?? 1
    const ox = this.#screenOriginX
    const oy = this.#screenOriginY
    material.clipBounds = [
      (ox + clip.xMin) * dpr,
      (oy + clip.yMin) * dpr,
      (ox + clip.xMax) * dpr,
      (oy + clip.yMax) * dpr,
    ]
  }

  #applyRoundedClipTo(material: RoundedRectMaterial): void {
    const clip = this.#clipStack[this.#clipStack.length - 1]!
    const dpr = this.canvas?.renderer.pixelRatio ?? 1
    const ox = this.#screenOriginX
    const oy = this.#screenOriginY
    // Если clipStack — это вся Card-rect (без активного pushClip), оставляем
    // zeros — шейдер их детектит и skip'ает scissor (быстрее).
    if (clip.xMin === 0 && clip.yMin === 0 && clip.xMax === this.rectW && clip.yMax === this.rectH) {
      return
    }
    material.clipBounds = [
      (ox + clip.xMin) * dpr,
      (oy + clip.yMin) * dpr,
      (ox + clip.xMax) * dpr,
      (oy + clip.yMax) * dpr,
    ]
  }

  #hitAt(x: number, y: number): HitBox | null {
    for (let i = this.#hits.length - 1; i >= 0; i--) {
      const h = this.#hits[i]!
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h
    }
    return null
  }

  #clearLayer(layer: Object3D = this.#layer): void {
    const renderer = this.canvas?.renderer
    for (const obj of layer.children) {
      const text = obj as Text
      if (text.isText === true) {
        if (renderer !== undefined) {
          if (text.stencilGeometry !== undefined) renderer.invalidateGeometry(text.stencilGeometry)
          if (text.coverGeometry !== undefined) renderer.invalidateGeometry(text.coverGeometry)
        }
        continue
      }
      const mesh = obj as Mesh
      if (mesh.geometry !== undefined && renderer !== undefined) renderer.invalidateGeometry(mesh.geometry)
    }
    layer.children = []
  }

  #fitText(value: string, maxPx: number, fontPx: number): string {
    const fullW = this.measureText(value, fontPx)
    if (fullW <= maxPx) return value
    const ellipsis = "..."
    const ellipsisW = this.measureText(ellipsis, fontPx)
    if (ellipsisW > maxPx) return ""
    let lo = 0
    let hi = value.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2)
      const sub = value.slice(0, mid)
      if (this.measureText(sub, fontPx) + ellipsisW <= maxPx) lo = mid
      else hi = mid - 1
    }
    if (lo === 0) return ellipsis
    return value.slice(0, lo) + ellipsis
  }

  #layoutTextBlock(
    value: string | readonly string[],
    w: number,
    h: number,
    opts: DrawTextBlockOpts,
  ): TextBlockMetrics {
    const pad = textBlockPadding(opts)
    const innerW = Math.max(0, w - pad.left - pad.right)
    const innerH = Math.max(0, h - pad.top - pad.bottom)
    const rawLines = normaliseTextBlockLines(value, opts.upper === true)
    if (rawLines.length === 0 || innerW <= 0 || innerH <= 0) {
      return { lines: [], fontPx: opts.fontPx ?? 0, lineHeightPx: 0, totalHeightPx: 0, maxLineWidthPx: 0 }
    }

    const lineHeightRatio = opts.lineHeight ?? 1.25
    const minFontPx = opts.minFontPx ?? 8
    let fontPx =
      opts.fontPx ??
      Math.max(minFontPx, Math.floor(innerH / Math.max(1, rawLines.length * lineHeightRatio) / this.pageScaleFactor))
    const fit = opts.fit ?? "shrink"
    let lines = layoutTextBlockLines(this, rawLines, innerW, fontPx, opts.wrap === true)

    if (fit === "shrink") {
      for (let i = 0; i < 8; i++) {
        lines = layoutTextBlockLines(this, rawLines, innerW, fontPx, opts.wrap === true)
        const limitedLines = limitTextBlockLines(lines, opts.maxLines)
        const maxLineW = maxTextBlockLineWidth(this, limitedLines, fontPx)
        const lineH = Math.max(1, fontPx * lineHeightRatio * this.pageScaleFactor)
        const totalH = limitedLines.length * lineH
        let next = fontPx
        if (maxLineW > innerW && maxLineW > 0) next = Math.min(next, (fontPx * innerW) / maxLineW)
        if (totalH > innerH && totalH > 0) next = Math.min(next, (fontPx * innerH) / totalH)
        next = Math.max(minFontPx, Math.floor(next))
        if (next >= fontPx || Math.abs(fontPx - next) < 1) {
          lines = limitedLines
          break
        }
        fontPx = next
        lines = limitedLines
      }
    }

    lines = limitTextBlockLines(lines, opts.maxLines)
    const lineHeightPx = Math.round(fontPx * lineHeightRatio * this.pageScaleFactor)
    const totalHeightPx = lines.length * lineHeightPx
    const maxLineWidthPx = maxTextBlockLineWidth(this, lines, fontPx)
    return { lines, fontPx, lineHeightPx, totalHeightPx, maxLineWidthPx }
  }
}

function mkMesh(name: string, mat: MeshBasicMaterial): Mesh {
  const m = new Mesh(new PlaneGeometry({width: 1, height: 1}), mat)
  m.name = name
  return m
}

function normaliseViewBox(viewBox: ImageViewBox | undefined): ImageViewBox {
  if (!viewBox) return { x: 0, y: 0, w: 1, h: 1 }
  return {
    x: clamp01(viewBox.x),
    y: clamp01(viewBox.y),
    w: Math.max(0.0001, Math.min(1, viewBox.w)),
    h: Math.max(0.0001, Math.min(1, viewBox.h)),
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function textBlockPadding(opts: DrawTextBlockOpts): {top: number; right: number; bottom: number; left: number} {
  const x = opts.padX ?? 0
  const y = opts.padY ?? 0
  return {
    top: opts.padTop ?? y,
    right: opts.padRight ?? x,
    bottom: opts.padBottom ?? y,
    left: opts.padLeft ?? x,
  }
}

function normaliseTextBlockLines(value: string | readonly string[], upper: boolean): string[] {
  const lines = typeof value === "string" ? value.split("\n") : [...value]
  return lines.map((line) => (upper ? line.toUpperCase() : line))
}

function layoutTextBlockLines(card: Card, rawLines: readonly string[], maxW: number, fontPx: number, wrap: boolean): string[] {
  if (!wrap) return [...rawLines]
  const out: string[] = []
  for (const raw of rawLines) {
    if (raw.trim().length === 0) {
      out.push("")
      continue
    }
    let line = ""
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (card.measureText(candidate, fontPx) <= maxW || line.length === 0) {
        line = candidate
      } else {
        out.push(line)
        line = word
      }
    }
    if (line) out.push(line)
  }
  return out
}

function limitTextBlockLines(lines: readonly string[], maxLines: number | undefined): string[] {
  if (maxLines === undefined || lines.length <= maxLines) return [...lines]
  if (maxLines <= 0) return []
  const out = lines.slice(0, maxLines)
  const last = out[maxLines - 1] ?? ""
  out[maxLines - 1] = last.endsWith("...") || last.length === 0 ? last : `${last}...`
  return out
}

function maxTextBlockLineWidth(card: Card, lines: readonly string[], fontPx: number): number {
  let max = 0
  for (const line of lines) max = Math.max(max, card.measureText(line, fontPx))
  return max
}
