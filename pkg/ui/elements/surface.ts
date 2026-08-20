/**
 * UiSurface — локальная UI-поверхность поверх UiRuntime.
 *
 * ГАРАНТИИ:
 *  • Background и border всегда внутри surface-rect — не вылазят за границы.
 *  • Bg/border меши ВЛАДЕНЫ UiSurface. Subclass их не трогает.
 *  • drawText обрезается через ИЗМЕРЕНИЕ font.getHMetric (font advance +
 *    letterSpacing 5%) — точное, не estimate. Бинарный поиск с "...".
 *  • drawTextCentered учитывает реальный bbox глифа (yMin/yMax из
 *    TrueTypeFont.getGlyphBounds), а не cap-box — корректно центрирует
 *    математические символы, guillemets и т.п.
 *  • drawRect клампится к surface-bounds.
 *  • Mesh.parent ВСЕГДА выставляется через Object3D.add() (не unshift).
 *  • Между renderами draw-слои пересобираются; обычные геометрии возвращаются
 *    в renderer.invalidateGeometry(). Кэшированные Text-геометрии остаются
 *    в GPU-кэше до LRU-вытеснения.
 *
 * Z-СТЕК:
 *   bg     -0.2
 *   border -0.1
 *   layer    0.0
 *   Z.SEPARATOR    +0.02
 *   Z.ELEMENT      +0.04
 *   Z.ELEMENT_RULE +0.06
 *   Z.TEXT         +0.08
 *
 * `node.renderLayer = "ui"` включает UI-depth модель в renderer: элементы
 * не пишут depth между собой, поэтому порядок рисования держится деревом
 * surface, а z остаётся только локальным приоритетом внутри небольшого стека.
 *
 * PADDING:
 *   Опция UiSurfaceOpts.padding (число px или {top,right,bottom,left}) даёт
 *   inner-rect отступ. drawText/drawRect/hit/clipStack работают в координатах
 *   inner-rect [0..innerW]×[0..innerH] (где innerW = rect.w − padLeft − padRight),
 *   а bg и border рисуются по полному surface-rect.
 *
 *   Пример (комбо с flexRow):
 *
 *     class Toolbar extends UiSurface {
 *       constructor() { super({ padding: 12 }) }
 *       protected render() {
 *         flexRow({
 *           x: 0, y: 0, w: this.rectW, h: this.rectH,
 *           justifyContent: "space-between", alignItems: "center",
 *           items: [
 *             {width: 120, height: 32, draw: (x,y,w,h) =>
 *               button(this, x, y, w, h, {label: "Save", action})},
 *             {width: 32,  height: 32, draw: (x,y,w,h) =>
 *               button(this, x, y, w, h, {label: "+", radius: Math.min(w,h)/2, action})},
 *           ],
 *         })
 *       }
 *     }
 */

import {
  Color,
  ColorPickerMaterial,
  type ColorPickerMaterialMode,
  ImageMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RadialBackdropMaterial,
  RoundedRectMaterial,
  CachedText,
  Text,
  TextMaterial,
  TexturedPlaneGeometry,
  TrueTypeFont,
  TextureLoader,
  type BufferGeometry,
  type ImageFit,
  Vector3,
  type ImageViewBox as EngineImageViewBox,
} from "@metafor/engine"
import type {UiDisplayId, UiSurfaceRect, UiRuntime, UiSurfaceNode} from "./runtime.ts"
import {MaterialPalette, palette} from "./theme.ts"
import {createUiPolylineStrokeGeometry, type UiPolylinePoint} from "./polyline.ts"

type UiFrameHandle = {kind: "raf"; id: number} | {kind: "timeout"; id: ReturnType<typeof setTimeout>}

type RetainedMaterialization = {
  target: Object3D
  staging: Object3D
  provisionalParents: Set<Object3D>
  hits: RetainedHitRecord[]
  wheelHits: RetainedWheelHitRecord[]
  renderKeys: Set<string>
}

const scheduleUiFrame = (callback: FrameRequestCallback): UiFrameHandle => {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return {kind: "raf", id: globalThis.requestAnimationFrame(callback)}
  }
  return {kind: "timeout", id: setTimeout(() => callback(Date.now()), 16)}
}

const cancelUiFrame = (handle: UiFrameHandle): void => {
  if (handle.kind === "raf") {
    if (typeof globalThis.cancelAnimationFrame === "function") globalThis.cancelAnimationFrame(handle.id)
    return
  }
  clearTimeout(handle.id)
}

export type HitBox = {
  x: number
  y: number
  w: number
  h: number
  key: string
  action(): void
  cursor: string
  activeCursor?: string
  tooltip?: TooltipHit
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onPointerDown?: (localX: number, localY: number, event?: MouseEvent) => void
  onPointerMove?: (localX: number, localY: number, event?: MouseEvent) => void
  onPointerUp?: (event?: MouseEvent) => void
}

export type WheelHitBox = {
  x: number
  y: number
  w: number
  h: number
  key: string
  onWheel(event: WheelEvent): void
}

export type TooltipHit = {
  label: string
  delayMs: number
  anchor?: "hit" | "cursor"
}

export type HitOptions = {
  cursor?: string
  activeCursor?: string
  tooltip?: TooltipHit
  key?: string
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onPointerDown?: (localX: number, localY: number, event?: MouseEvent) => void
  onPointerMove?: (localX: number, localY: number, event?: MouseEvent) => void
  onPointerUp?: (event?: MouseEvent) => void
}

export type RetainedHitScreenMinimum = Readonly<{
  width: number
  height: number
}>

export type RetainedHitOptions = HitOptions & Readonly<{
  /** Invisible surface-space floor; it never changes visual geometry. */
  screenMinimum?: RetainedHitScreenMinimum
}>

export type HitState = {
  hovered: boolean
  pressed: boolean
}

export type UiSurfacePadding = number | {top?: number; right?: number; bottom?: number; left?: number}

export type UiSurfaceOpts = {
  bgColor?: Color | null
  /** null = без рамки. Default — серая 1px. */
  borderColor?: Color | null
  borderWidthPx?: number
  /** Скругление внешнего bg/border chrome в logical px. Default 0. */
  borderRadiusPx?: number
  /**
   * Внутренние отступы в logical px. drawText/drawRect/hit/flex работают в
   * inner rect [0..innerW]×[0..innerH], где innerW = rect.w - padLeft - padRight,
   * innerH = rect.h - padTop - padBottom. bg и border рисуются по полному rect
   * (snug к canvas slot), а контент UiSurface сдвинут внутрь.
   *
   * Можно задать число (uniform) или per-side объект.
   * Default 0.
   */
  padding?: UiSurfacePadding
}

export type ImageViewBox = EngineImageViewBox

export type DrawImageOpts = {
  fit?: ImageFit
  opacity?: number
  tint?: Color
  viewBox?: ImageViewBox
  z?: number
}

export type BackgroundImageOpts = {
  src: string
  fit?: ImageFit
  opacity?: number
  viewBox?: ImageViewBox
  /** 0..1 — масштаб bg-image относительно surface-rect; центрируется.
   *  1 = заполнить, 0.8 = 80% размера с 10% полем по краям. Default 1. */
  scale?: number
}

export type BackdropGlow = {
  color: Color | number | string
  cx: number
  cy: number
  radius: number
  opacity?: number
}

export type DrawBackdropGradientOpts = {
  base: Color | number | string
  glowA: BackdropGlow
  glowB: BackdropGlow
  z?: number
}

export type ColorPickerPlaneDrawOptions = Readonly<{
  mode: ColorPickerMaterialMode
  hue: number
  saturation: number
  value: number
  alpha: number
  opacity?: number
  z?: number
}>

export type DrawTextOpts = {
  fontPx: number
  material: TextMaterial
  /** Reference-px letter spacing. Default is Text default (5% font size). */
  letterSpacingPx?: number
  /** Reference-px width for space glyphs. Default is Text default (0.3em). */
  spaceAdvancePx?: number
  /** Гарантия: текст обрезается через измерение и "...". */
  maxWidthPx?: number
  /** Default true. false — рисовать без ellipsis-fitting, обычно внутри clip. */
  fit?: boolean
  /** Default true. false — не мерить итоговую ширину для return value. */
  measure?: boolean
  z?: number
  /** Default true. Tooltip/UI overlays can opt out to draw outside surface rect. */
  clip?: boolean
  /** Screen-space radians, clockwise-positive. */
  rotationRad?: number
  /** Screen-space rotation origin. Defaults to the text baseline origin. */
  rotationOrigin?: {x: number; y: number}
}

export type UiSurfaceDrawLayer = "underlay" | "contentUnderlay" | "selection" | "main" | "overlay"

export type TextBlockAlign = "left" | "center" | "right"
export type TextBlockVAlign = "top" | "middle" | "bottom"

export type DrawTextBlockOpts = {
  /** Reference-px if UiSurface.referenceHeight is set, otherwise canvas-px. */
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

// UiSurface по умолчанию ПРОЗРАЧНА: ни заливки, ни border'а. Чтобы вернуть
// «классическую» тёмную surface с обводкой — передайте bgColor/borderColor
// явно в UiSurfaceOpts. null отключает явно.
const DEFAULT_BG: Color | null = null
const DEFAULT_BORDER: Color | null = null
const CLIP_EVIDENCE: unique symbol = Symbol("UiSurface.clipEvidence")

type ClipLocalRect = {xMin: number; yMin: number; xMax: number; yMax: number}
type ClipEvidence =
  | Readonly<{space: "surface"; local: ClipLocalRect}>
  | Readonly<{space: "retained"; parent: Object3D; local: ClipLocalRect | null}>
type ClipTagged = {
  [CLIP_EVIDENCE]?: ClipEvidence
}
type ClipBoundsHost = ClipTagged & {
  clipBounds: [number, number, number, number] | null
}
type PendingTooltipDraw = {
  x: number
  y: number
  w: number
  h: number
  label: string
  anchor: "hit" | "cursor"
  cursorX: number
  cursorY: number
}

type RetainedHitRecord = {
  parent: Object3D
  x: number
  y: number
  w: number
  h: number
  key: string
  action(): void
  cursor: string
  activeCursor?: string
  tooltip?: TooltipHit
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onPointerDown?: (localX: number, localY: number, event?: MouseEvent) => void
  onPointerMove?: (localX: number, localY: number, event?: MouseEvent) => void
  onPointerUp?: (event?: MouseEvent) => void
  screenMinimum?: RetainedHitScreenMinimum
}

type RetainedWheelHitRecord = Readonly<{
  parent: Object3D
  x: number
  y: number
  w: number
  h: number
  key: string
  onWheel(event: WheelEvent): void
}>

type ResolvedHitBox = HitBox & Readonly<{retainedParent?: Object3D}>
type ResolvedWheelHitBox = WheelHitBox & Readonly<{retainedParent?: Object3D}>

const RETAINED_UNBOUNDED_CLIP: ClipLocalRect = {
  xMin: Number.NEGATIVE_INFINITY,
  yMin: Number.NEGATIVE_INFINITY,
  xMax: Number.POSITIVE_INFINITY,
  yMax: Number.POSITIVE_INFINITY,
}

export type UiCursorTooltipPlacement = Readonly<{
  x: number
  y: number
  side: "top" | "right" | "bottom" | "left"
}>

export const Z: {
  readonly CONTAINER: number
  readonly SEPARATOR: number
  readonly ELEMENT: number
  readonly ELEMENT_RULE: number
  readonly TEXT: number
} = {
  CONTAINER: 0,
  SEPARATOR: 0.02,
  ELEMENT: 0.04,
  ELEMENT_RULE: 0.06,
  TEXT: 0.08,
}

export abstract class UiSurface implements UiSurfaceNode {
  readonly node = new Object3D()
  /** Готовый набор TextMaterial'ов с palette-цветами. Reuse, не GC-friendly create. */
  readonly materials = new MaterialPalette()
  protected canvas: UiRuntime | null = null
  protected font: TrueTypeFont | null = null
  protected pixelScale = 0.001
  protected rectW = 1
  protected rectH = 1
  /**
   * Reference-height: если задан, то `opts.fontPx` в `drawText` /
   * `drawTextCentered` / `measureText` интерпретируется как пиксели
   * в reference-системе (например, журнальная страница 1055px), а не
   * как canvas-px. Внутри умножаем на `rectH / referenceHeight`,
   * чтобы шрифт пропорционально масштабировался при ресайзе surface.
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
  readonly #borderRadiusPx: number
  readonly #roundedChrome: Mesh | null
  readonly #bgColor: Color | null
  readonly #borderColor: Color | null
  #active = false
  readonly #backgroundLayer: Object3D
  readonly #underlayLayer: Object3D
  readonly #contentUnderlayLayer: Object3D
  readonly #selectionLayer: Object3D
  readonly #layer: Object3D
  readonly #overlayLayer: Object3D
  readonly #retainedLayer: Object3D
  readonly #retainedParents = new Set<Object3D>()
  readonly #retainedHits = new Map<Object3D, readonly RetainedHitRecord[]>()
  readonly #retainedWheelHits = new Map<Object3D, readonly RetainedWheelHitRecord[]>()
  readonly #retainedRenderKeys = new Map<Object3D, ReadonlySet<string>>()
  readonly #retainedDraws = new Map<Object3D, () => void>()
  readonly #retainedViewportClips = new Map<Object3D, ClipLocalRect>()
  #retainedMaterialization: RetainedMaterialization | null = null
  #drawLayer: UiSurfaceDrawLayer = "main"
  #framebufferDisplayId: UiDisplayId = "default"
  /** Padding в logical px (top, right, bottom, left). */
  readonly #padTop: number
  readonly #padRight: number
  readonly #padBottom: number
  readonly #padLeft: number
  #hits: HitBox[] = []
  #wheelHits: WheelHitBox[] = []
  protected hoveredHit: HitBox | null = null
  protected pressedHit: HitBox | null = null
  #hoveredHitKey: string | null = null
  #pressedHitKey: string | null = null
  #hoverTooltipKey: string | null = null
  #hoverTooltipSince = 0
  #hoverTooltipDelayMs = 0
  #hoverTooltipTimer: ReturnType<typeof setTimeout> | null = null
  #pointerX = 0
  #pointerY = 0
  #lastRetainedInteraction: Readonly<{key: string; parent: Object3D}> | null = null
  #pendingTooltipDraws: PendingTooltipDraw[] = []
  #backgroundImage: BackgroundImageOpts | null = null
  #rerenderRafId: UiFrameHandle | null = null
  #keyedRerenderRafId: UiFrameHandle | null = null
  readonly #keyedRerenderParents = new Set<Object3D>()
  #layerRerenderRafId: UiFrameHandle | null = null
  readonly #layerRerenderLayers = new Set<UiSurfaceDrawLayer>()
  #layerRerenderDraw: (() => void) | null = null

  /** Top-left corner of surface on canvas в logical-px (для конверсии в screen-px). */
  #screenOriginX = 0
  #screenOriginY = 0
  #framebufferClipSpace: "display" | "screen" = "display"
  #fullRectW = 1
  #fullRectH = 1
  readonly #requestRenderOnImageLoad = (): void => {
    this.requestRender()
  }
  /** Стек clip-rect'ов в surface-local-px. Первый элемент = вся surface-rect. */
  #clipStack: Array<{xMin: number; yMin: number; xMax: number; yMax: number}> = []

  constructor(opts: UiSurfaceOpts = {}) {
    const bgColor = opts.bgColor === null ? null : opts.bgColor ?? DEFAULT_BG
    const borderColor = opts.borderColor === null ? null : opts.borderColor ?? DEFAULT_BORDER
    this.#borderWidthPx = opts.borderWidthPx ?? 1
    this.#borderRadiusPx = Math.max(0, opts.borderRadiusPx ?? 0)
    this.#bgColor = bgColor
    this.#borderColor = borderColor

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
    this.node.renderLayer = "ui"

    if (this.#borderRadiusPx > 0 && (bgColor !== null || borderColor !== null)) {
      this.#roundedChrome = new Mesh(
        new PlaneGeometry({width: 1, height: 1}),
        new RoundedRectMaterial({
          width: 1,
          height: 1,
          radius: this.#borderRadiusPx * 0.001,
          fill: bgColor ?? new Color(1, 1, 1, 0),
          border: borderColor,
          borderWidth: this.#borderWidthPx * 0.001,
        }),
      )
      this.#roundedChrome.name = `${this.constructor.name}.roundedChrome`
      this.#roundedChrome.position.z = -0.2
      this.node.add(this.#roundedChrome)
    } else {
      this.#roundedChrome = null
    }

    if (bgColor !== null && this.#roundedChrome === null) {
      this.#bg = new Mesh(new PlaneGeometry({width: 1, height: 1}), new MeshBasicMaterial({color: bgColor}))
      this.#bg.name = `${this.constructor.name}.bg`
      this.#bg.position.z = -0.2
      this.node.add(this.#bg)
    } else {
      this.#bg = null
    }

    if (borderColor !== null && this.#roundedChrome === null) {
      const borderMat = new MeshBasicMaterial({color: borderColor})
      this.#borderTop = mkMesh(`${this.constructor.name}.borderTop`, borderMat)
      this.#borderBottom = mkMesh(`${this.constructor.name}.borderBottom`, borderMat)
      this.#borderLeft = mkMesh(`${this.constructor.name}.borderLeft`, borderMat)
      this.#borderRight = mkMesh(`${this.constructor.name}.borderRight`, borderMat)
      for (const m of [this.#borderTop, this.#borderBottom, this.#borderLeft, this.#borderRight]) {
        m.position.z = -0.1
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

    this.#underlayLayer = new Object3D()
    this.#underlayLayer.name = `${this.constructor.name}.underlayLayer`
    this.#underlayLayer.position.z = 0
    this.node.add(this.#underlayLayer)

    this.#contentUnderlayLayer = new Object3D()
    this.#contentUnderlayLayer.name = `${this.constructor.name}.contentUnderlayLayer`
    this.#contentUnderlayLayer.position.z = 0
    this.node.add(this.#contentUnderlayLayer)

    // Retained presentation objects (for example graph traffic particles) are
    // composited above declarative relation underlays and below interactive
    // controls/sockets. They survive redraws without being allowed to hide UI.
    this.#retainedLayer = new Object3D()
    this.#retainedLayer.name = `${this.constructor.name}.retainedLayer`
    this.#retainedLayer.position.z = 0
    this.node.add(this.#retainedLayer)

    this.#selectionLayer = new Object3D()
    this.#selectionLayer.name = `${this.constructor.name}.selectionLayer`
    this.#selectionLayer.position.z = 0
    this.node.add(this.#selectionLayer)

    this.#layer = new Object3D()
    this.#layer.name = `${this.constructor.name}.layer`
    this.#layer.position.z = 0
    this.node.add(this.#layer)

    this.#overlayLayer = new Object3D()
    this.#overlayLayer.name = `${this.constructor.name}.overlayLayer`
    this.#overlayLayer.position.z = 0
    this.node.add(this.#overlayLayer)

  }

  attachCanvas(canvas: UiRuntime): void {
    this.canvas = canvas
  }

  /** Full outer surface size before optional content padding. */
  get frameWidth(): number {
    return this.#fullRectW
  }

  get frameHeight(): number {
    return this.#fullRectH
  }

  /** Public frame bridge for reusable UI chrome such as movable HUD panes. */
  surfaceFrame(): {rect: UiSurfaceRect; bounds: {w: number; h: number}} | null {
    return this.canvas?.surfaceFrame(this) ?? null
  }

  setSurfaceFrame(rect: UiSurfaceRect): UiSurfaceRect | null {
    return this.canvas?.setSurfaceRect(this, rect) ?? null
  }

  protected get active(): boolean {
    return this.#active
  }

  setActive(active: boolean): void {
    if (this.#active === active) return
    this.#active = active
    if (this.font !== null) this.#syncChrome(this.#fullRectW, this.#fullRectH)
    this.requestRender()
  }

  setFramebufferClipSpace(space: "display" | "screen"): void {
    this.#framebufferClipSpace = space
  }

  setFramebufferDisplayId(displayId: UiDisplayId): void {
    this.#framebufferDisplayId = displayId
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

  setRect(rect: UiSurfaceRect, pixelScale: number, font: TrueTypeFont): void {
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
    // screenOrigin — для hit-mapping. Pointermove приходит в surface-rect-local
    // (UiRuntime вычитает rect.x/y), и мы дополнительно вычитаем padding в
    // onPointerMove/Down/Up перед #hitAt.
    this.#screenOriginX = rect.x
    this.#screenOriginY = rect.y
    // Сдвигаем draw-слои на padLeft/padTop, чтобы локальные draw-координаты
    // [0..innerW] оказались в правильном месте canvas.
    for (const layer of this.#positionedLayers()) {
      layer.position.x = this.#padLeft * pixelScale
      layer.position.y = -this.#padTop * pixelScale
      layer.updateMatrix()
    }
    this.#syncChrome(rect.w, rect.h)
    this.#rerenderNow()
  }

  moveRect(rect: UiSurfaceRect, pixelScale: number, font: TrueTypeFont): void {
    this.font = font
    this.pixelScale = pixelScale
    this.#screenOriginX = rect.x
    this.#screenOriginY = rect.y
    this.#refreshClipBounds()
  }

  /** Элементы и subclass'ы зовут при изменении state — re-render без resize. */
  requestRender(): void {
    if (this.font === null) return
    this.#cancelPendingLayerRerender()
    if (this.#rerenderRafId === null) {
      this.#rerenderRafId = scheduleUiFrame(() => {
        this.#rerenderRafId = null
        if (this.font === null) return
        this.#rerender()
        this.canvas?.requestRender()
      })
    }
    this.canvas?.requestRender()
  }

  /** Re-renders the exact retained owner of a delayed keyed interaction, if any. */
  requestHitRender(key: string): void {
    let parent = this.#lastRetainedInteraction?.key === key
      ? this.#lastRetainedInteraction.parent
      : null
    if (parent === null || !this.#retainedParents.has(parent)) {
      for (const [candidate, hits] of this.#retainedHits) {
        if (hits.some((hit) => hit.key === key)) parent = candidate
      }
    }
    if (parent !== null && this.#retainedParents.has(parent)) {
      this.#notifyRetainedInteraction(parent, key)
    }
    this.requestRender()
  }

  /**
   * Binds one delayed/programmatic state key to the exact retained transaction.
   * Immediate-mode calls deliberately stay unbound and keep full-Surface fallback.
   */
  registerRenderKey(key: string): void {
    this.#retainedMaterialization?.renderKeys.add(key)
  }

  /**
   * Schedules only the retained owner previously staged with this key.
   * Missing or ambiguous ownership falls back to the ordinary Surface render.
   */
  requestKeyedRender(key: string): void {
    const parent = this.#retainedParentForKey(key)
    if (parent === null || !this.#retainedDraws.has(parent) || this.font === null) {
      this.requestRender()
      return
    }
    this.#keyedRerenderParents.add(parent)
    if (this.#keyedRerenderRafId === null) {
      this.#keyedRerenderRafId = scheduleUiFrame(() => {
        this.#redrawKeyedRetainedParents()
        this.canvas?.requestRender()
      })
    }
    this.canvas?.requestRender()
  }

  /** Subclasses can dirty the exact existing component parent without a second graph. */
  protected onRetainedInteractionChange(_parent: Object3D): void {}

  flushPendingRender(): void {
    if (this.font === null) return
    if (this.#rerenderRafId !== null) this.#rerenderNow()
    if (this.#keyedRerenderRafId !== null) this.#redrawKeyedRetainedParents()
    if (this.#layerRerenderRafId !== null) this.#redrawRequestedLayers()
  }

  withLayer(layer: UiSurfaceDrawLayer, draw: () => void): void {
    const prev = this.#drawLayer
    this.#drawLayer = layer
    try {
      draw()
    } finally {
      this.#drawLayer = prev
    }
  }

  protected redrawLayers(layers: readonly UiSurfaceDrawLayer[], draw: () => void): void {
    if (this.font === null) return
    if (this.#rerenderRafId !== null) this.#rerenderNow()
    this.#cancelPendingLayerRerender()
    for (const layer of layers) this.#clearLayer(this.#layerObject(layer))
    this.#clipStack = [{xMin: 0, yMin: 0, xMax: this.rectW, yMax: this.rectH}]
    draw()
    this.canvas?.requestRender()
  }

  protected requestRedrawLayers(layers: readonly UiSurfaceDrawLayer[], draw: () => void): boolean {
    if (this.font === null) return false
    if (this.#rerenderRafId !== null) {
      this.canvas?.requestRender()
      return true
    }
    for (const layer of layers) this.#layerRerenderLayers.add(layer)
    this.#layerRerenderDraw = draw
    if (this.#layerRerenderRafId === null) {
      this.#layerRerenderRafId = scheduleUiFrame(() => {
        this.#redrawRequestedLayers()
        this.canvas?.requestRender()
      })
    }
    this.canvas?.requestRender()
    return true
  }

  /** Creates one Surface-owned engine parent, optionally nested under another. */
  protected createRetainedParent(parent?: Object3D): Object3D {
    const requestedParent = parent ?? this.#retainedLayer
    const transaction = this.#retainedMaterialization
    let attachmentParent = requestedParent

    if (transaction !== null) {
      if (requestedParent === transaction.target) attachmentParent = transaction.staging
      else if (!transaction.provisionalParents.has(requestedParent)) {
        throw new Error("A retained parent created during materialization must stay inside the staged subtree")
      }
    } else if (requestedParent !== this.#retainedLayer && !this.#retainedParents.has(requestedParent)) {
      throw new Error("Retained parents can only be nested inside a parent owned by this UiSurface")
    }

    const retainedParent = new Object3D()
    attachmentParent.add(retainedParent)
    if (transaction === null) this.#retainedParents.add(retainedParent)
    else transaction.provisionalParents.add(retainedParent)
    return retainedParent
  }

  /** Atomically replaces one retained parent's local drawing subtree. */
  protected materializeRetainedParent(parent: Object3D, draw: () => void): void {
    this.#requireRetainedParent(parent)
    if (this.#retainedMaterialization !== null) {
      throw new Error("Nested retained materialization is not supported")
    }

    const staging = new Object3D()
    const transaction: RetainedMaterialization = {
      target: parent,
      staging,
      provisionalParents: new Set<Object3D>(),
      hits: [],
      wheelHits: [],
      renderKeys: new Set<string>(),
    }
    const previousClipStack = this.#clipStack
    this.#retainedMaterialization = transaction
    this.#clipStack = [{...RETAINED_UNBOUNDED_CLIP}]

    try {
      draw()
    } catch (error) {
      this.#retainedMaterialization = null
      this.#clipStack = previousClipStack
      this.#disposeChildren(staging)
      throw error
    }

    this.#retainedMaterialization = null
    this.#clipStack = previousClipStack

    const previousChildren = [...parent.children]
    const nextChildren = [...staging.children]
    for (const child of previousChildren) parent.remove(child)
    for (const child of nextChildren) {
      staging.remove(child)
      parent.add(child)
    }
    for (const retainedParent of transaction.provisionalParents) this.#retainedParents.add(retainedParent)
    this.#retainedDraws.set(parent, draw)
    this.#replaceRetainedHits(parent, transaction.hits)
    this.#replaceRetainedWheelHits(parent, transaction.wheelHits)
    this.#replaceRetainedRenderKeys(parent, transaction.renderKeys)
    this.#disposeSubtrees(previousChildren)
    this.#keyedRerenderParents.delete(parent)
    this.canvas?.requestRender()
  }

  /** Updates only one retained parent's local transform and presents the frame. */
  protected updateRetainedTransform(parent: Object3D, update: (parent: Object3D) => void): void {
    this.#requireRetainedParent(parent)
    update(parent)
    parent.updateMatrix()
    this.#refreshClipBoundsForObject(parent)
    this.canvas?.requestRender()
  }

  /** Sets one fixed surface-local viewport clip without rematerializing its subtree. */
  protected updateRetainedViewportClip(parent: Object3D, clip: UiSurfaceRect | null): void {
    this.#requireRetainedParent(parent)
    if (clip === null) {
      if (!this.#retainedViewportClips.delete(parent)) return
    } else {
      if (![clip.x, clip.y, clip.w, clip.h].every(Number.isFinite) || clip.w < 0 || clip.h < 0) {
        throw new Error("A retained viewport clip requires a finite non-negative surface rect")
      }
      const next = normaliseClipRect(clip)
      const current = this.#retainedViewportClips.get(parent)
      if (current !== undefined && sameClipRect(current, next)) return
      this.#retainedViewportClips.set(parent, next)
    }
    this.#refreshClipBoundsForObject(parent)
    this.canvas?.requestRender()
  }

  /** Changes retained visibility and releases any interaction owned by a hidden subtree. */
  protected updateRetainedVisibility(parent: Object3D, visible: boolean): void {
    this.#requireRetainedParent(parent)
    if (parent.visible === visible) return
    parent.visible = visible
    if (!visible) this.#releaseRetainedHitStateForSubtree(parent)
    this.canvas?.requestRender()
  }

  /** Surface outer event coordinates to the inner coordinate origin used by retainedLayer. */
  protected surfaceInnerPoint(localX: number, localY: number): Readonly<{x: number; y: number}> {
    return {x: localX - this.#padLeft, y: localY - this.#padTop}
  }

  /** Converts one inner-surface logical point through the actual retained parent inverse. */
  protected surfaceToRetainedPoint(parent: Object3D, point: Readonly<{x: number; y: number}>): Readonly<{x: number; y: number}> {
    this.#requireRetainedParent(parent)
    this.#updateRetainedMatrices()
    const parentInverse = new Matrix4().copy(parent.matrixWorld).invert()
    const local = new Vector3(point.x * this.pixelScale, -point.y * this.pixelScale, 0)
      .applyMatrix4(this.#retainedLayer.matrixWorld)
      .applyMatrix4(parentInverse)
    return {x: local.x / this.pixelScale, y: -local.y / this.pixelScale}
  }

  /** Converts one retained logical point to the inner-surface origin through actual matrixWorld. */
  protected retainedToSurfacePoint(parent: Object3D, point: Readonly<{x: number; y: number}>): Readonly<{x: number; y: number}> {
    this.#requireRetainedParent(parent)
    this.#updateRetainedMatrices()
    const surfaceInverse = new Matrix4().copy(this.#retainedLayer.matrixWorld).invert()
    const local = new Vector3(point.x * this.pixelScale, -point.y * this.pixelScale, 0)
      .applyMatrix4(parent.matrixWorld)
      .applyMatrix4(surfaceInverse)
    return {x: local.x / this.pixelScale, y: -local.y / this.pixelScale}
  }

  protected surfaceToRetainedRect(parent: Object3D, rect: UiSurfaceRect): UiSurfaceRect {
    return this.#convertRect(rect, (point) => this.surfaceToRetainedPoint(parent, point))
  }

  protected retainedToSurfaceRect(parent: Object3D, rect: UiSurfaceRect): UiSurfaceRect {
    return this.#convertRect(rect, (point) => this.retainedToSurfacePoint(parent, point))
  }

  /** Stages one invisible hit record with the same atomic lifecycle as target's subtree. */
  protected retainedHit(
    parent: Object3D,
    x: number,
    y: number,
    w: number,
    h: number,
    action: () => void,
    options: RetainedHitOptions = {},
  ): void {
    const transaction = this.#retainedMaterialization
    if (transaction === null || transaction.target !== parent) {
      throw new Error("A retained hit must be staged while materializing its exact parent")
    }
    this.#stageRetainedHit(parent, x, y, w, h, action, options)
  }

  #stageRetainedHit(
    parent: Object3D,
    x: number,
    y: number,
    w: number,
    h: number,
    action: () => void,
    options: RetainedHitOptions,
  ): void {
    this.#requireRetainedParent(parent)
    const transaction = this.#retainedMaterialization
    if (transaction === null || transaction.target !== parent) {
      throw new Error("A retained hit must be staged while materializing its exact parent")
    }
    if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0) {
      throw new Error("A retained hit requires a finite non-negative local rect")
    }
    const record: RetainedHitRecord = {
      parent,
      x,
      y,
      w,
      h,
      key: options.key ?? hitKeyFor(x, y, w, h),
      action,
      cursor: options.cursor ?? "pointer",
    }
    if (options.activeCursor !== undefined) record.activeCursor = options.activeCursor
    if (options.tooltip !== undefined) record.tooltip = options.tooltip
    if (options.onPointerEnter !== undefined) record.onPointerEnter = options.onPointerEnter
    if (options.onPointerLeave !== undefined) record.onPointerLeave = options.onPointerLeave
    if (options.onPointerDown !== undefined) record.onPointerDown = options.onPointerDown
    if (options.onPointerMove !== undefined) record.onPointerMove = options.onPointerMove
    if (options.onPointerUp !== undefined) record.onPointerUp = options.onPointerUp
    if (options.screenMinimum !== undefined) {
      const {width, height} = options.screenMinimum
      if (![width, height].every(Number.isFinite) || width < 0 || height < 0) {
        throw new Error("A retained hit screen minimum must be finite and non-negative")
      }
      record.screenMinimum = {width, height}
    }
    transaction.hits.push(record)
    transaction.renderKeys.add(record.key)
  }

  /** Removes a retained parent and its complete owned subtree. Repeated removal is a no-op. */
  protected removeRetainedParent(parent: Object3D): void {
    if (!this.#retainedParents.has(parent)) return
    if (this.#retainedMaterialization !== null) {
      throw new Error("A retained parent cannot be removed during materialization")
    }
    this.#disposeSubtrees([parent])
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
    if (opts.maxWidthPx !== undefined && maxPx <= 0) return 0
    const fitted = opts.fit === false || !Number.isFinite(maxPx)
      ? value
      : this.#fitText(value, maxPx, opts.fontPx, opts.letterSpacingPx, opts.spaceAdvancePx)
    if (fitted.length === 0) return 0
    // fontPx — в reference-px (если referenceHeight задан); приводим к
    // canvas-px через pageScaleFactor для размера текста и y-сдвига.
    const fontPxCanvas = opts.fontPx * this.pageScaleFactor
    const text = new CachedText(fitted, this.font, fontPxCanvas * this.pixelScale, opts.material)
    if (opts.letterSpacingPx !== undefined) {
      text.letterSpacing = opts.letterSpacingPx * this.pageScaleFactor * this.pixelScale
    }
    if (opts.spaceAdvancePx !== undefined) {
      text.spaceAdvance = opts.spaceAdvancePx * this.pageScaleFactor * this.pixelScale
    }
    if (opts.letterSpacingPx !== undefined || opts.spaceAdvancePx !== undefined) {
      text.updateGeometry()
    }
    text.position.x = x * this.pixelScale
    // y — top-of-cap (canvas-px). Baseline ≈ y + fontPxCanvas.
    text.position.y = -(y + fontPxCanvas) * this.pixelScale
    text.position.z = opts.z ?? Z.TEXT
    if (opts.rotationRad !== undefined) {
      const rotation = -opts.rotationRad
      if (opts.rotationOrigin !== undefined) {
        const ox = opts.rotationOrigin.x * this.pixelScale
        const oy = -opts.rotationOrigin.y * this.pixelScale
        const px = text.position.x
        const py = text.position.y
        const dx = px - ox
        const dy = py - oy
        const cos = Math.cos(rotation)
        const sin = Math.sin(rotation)
        text.position.x = ox + dx * cos - dy * sin
        text.position.y = oy + dx * sin + dy * cos
      }
      text.rotation.z = rotation
    }
    text.updateMatrix()
    if (opts.clip !== false) this.#applyClipTo(text)
    this.#currentLayer().add(text)
    return opts.measure === false ? 0 : this.measureText(fitted, opts.fontPx, opts.letterSpacingPx, opts.spaceAdvancePx)
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
    const material = new MeshBasicMaterial({color})
    this.#applyBasicClipTo(material)
    const mesh = new Mesh(
      new PlaneGeometry({width: cw * this.pixelScale, height: ch * this.pixelScale}),
      material,
    )
    mesh.position.x = (x0 + cw / 2) * this.pixelScale
    mesh.position.y = -(y0 + ch / 2) * this.pixelScale
    mesh.position.z = z
    mesh.updateMatrix()
    this.#currentLayer().add(mesh)
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, color: Color, thicknessPx = 2, z = Z.ELEMENT): void {
    const dx = x1 - x0
    const dy = y1 - y0
    const length = Math.hypot(dx, dy)
    if (length <= 0 || thicknessPx <= 0) return
    const material = new MeshBasicMaterial({color})
    this.#applyBasicClipTo(material)
    const mesh = new Mesh(
      new PlaneGeometry({width: length * this.pixelScale, height: thicknessPx * this.pixelScale}),
      material,
    )
    mesh.position.x = ((x0 + x1) / 2) * this.pixelScale
    mesh.position.y = -((y0 + y1) / 2) * this.pixelScale
    mesh.position.z = z
    mesh.rotation.z = -Math.atan2(dy, dx)
    mesh.updateMatrix()
    this.#currentLayer().add(mesh)
  }

  drawRoundedLine(x0: number, y0: number, x1: number, y1: number, color: Color, thicknessPx = 2, z = Z.ELEMENT): void {
    const dx = x1 - x0
    const dy = y1 - y0
    const length = Math.hypot(dx, dy)
    if (length <= 0 || thicknessPx <= 0) return
    const width = length * this.pixelScale
    const height = thicknessPx * this.pixelScale
    const material = new RoundedRectMaterial({
      width,
      height,
      radius: height / 2,
      fill: color,
      border: null,
    })
    this.#applyRoundedClipTo(material)
    const mesh = new Mesh(
      new PlaneGeometry({width, height}),
      material,
    )
    mesh.position.x = ((x0 + x1) / 2) * this.pixelScale
    mesh.position.y = -((y0 + y1) / 2) * this.pixelScale
    mesh.position.z = z
    mesh.rotation.z = -Math.atan2(dy, dx)
    mesh.updateMatrix()
    this.#currentLayer().add(mesh)
  }

  /**
   * Draws one connected thick 2D curve as one indexed Mesh.
   * Points are logical surface pixels; adjacent segments share miter joins.
   */
  drawPolyline(points: readonly UiPolylinePoint[], color: Color, thicknessPx = 2, z = Z.ELEMENT): void {
    const geometry = createUiPolylineStrokeGeometry(points, thicknessPx)
    if (geometry === null) return
    const material = new MeshBasicMaterial({color})
    this.#applyBasicClipTo(material)
    const mesh = new Mesh(geometry, material)
    mesh.scale.set(this.pixelScale, -this.pixelScale, 1)
    mesh.position.z = z
    mesh.updateMatrix()
    this.#currentLayer().add(mesh)
  }

  drawImage(src: string, x: number, y: number, w: number, h: number, opts: DrawImageOpts = {}): void {
    this.#drawImageMesh(this.#currentLayer(), src, x, y, w, h, opts, opts.z ?? Z.ELEMENT, true)
  }

  drawBackdropGradient(opts: DrawBackdropGradientOpts): void {
    const w = this.rectW
    const h = this.rectH
    if (w <= 0 || h <= 0) return
    const ps = this.pixelScale
    const material = new RadialBackdropMaterial({
      width: w * ps,
      height: h * ps,
      base: opts.base,
      glowA: opts.glowA,
      glowB: opts.glowB,
    })
    const mesh = new Mesh(new PlaneGeometry({width: w * ps, height: h * ps}), material)
    mesh.position.x = (w / 2) * ps
    mesh.position.y = -(h / 2) * ps
    mesh.position.z = opts.z ?? -0.18
    mesh.updateMatrix()
    this.#currentLayer().add(mesh)
  }

  /** Draws one texture-free analytical quad for a color wheel or vertical slider. */
  drawColorPickerPlane(
    x: number,
    y: number,
    w: number,
    h: number,
    opts: ColorPickerPlaneDrawOptions,
  ): void {
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return
    const ps = this.pixelScale
    const materialOptions: ConstructorParameters<typeof ColorPickerMaterial>[0] = {
      width: w * ps,
      height: h * ps,
      mode: opts.mode,
      hue: opts.hue,
      saturation: opts.saturation,
      value: opts.value,
      alpha: opts.alpha,
    }
    if (opts.opacity !== undefined) materialOptions.opacity = opts.opacity
    const material = new ColorPickerMaterial(materialOptions)
    this.#applyColorPickerClipTo(material)
    const mesh = new Mesh(new PlaneGeometry({width: w * ps, height: h * ps}), material)
    mesh.position.x = (x + w / 2) * ps
    mesh.position.y = -(y + h / 2) * ps
    mesh.position.z = opts.z ?? Z.ELEMENT
    mesh.updateMatrix()
    this.#currentLayer().add(mesh)
  }

  drawTooltipForHit(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    opts: {delayMs?: number; anchor?: "hit" | "cursor"} = {},
  ): void {
    if (label.length === 0) return
    const delayMs = opts.delayMs ?? 450
    const transaction = this.#retainedMaterialization
    const target = transaction === null
      ? {x, y, w, h}
      : this.retainedToSurfaceRect(transaction.target, {x, y, w, h})
    const key = tooltipKey(target.x, target.y, target.w, target.h, label)
    if (this.#hoverTooltipKey !== key) return
    if (performance.now() - this.#hoverTooltipSince < delayMs) return
    this.#pendingTooltipDraws.push({
      x: target.x,
      y: target.y,
      w: target.w,
      h: target.h,
      label,
      anchor: opts.anchor ?? "hit",
      cursorX: this.#pointerX,
      cursorY: this.#pointerY,
    })
  }

  #drawTooltipNow({x, y, w, h, label, anchor, cursorX, cursorY}: PendingTooltipDraw): void {
    const fontPx = 11
    const padX = 9
    const padY = 6
    const lineHeight = 15
    const surfaceFrame = this.surfaceFrame() ?? {
      rect: {x: this.#screenOriginX, y: this.#screenOriginY, w: this.rectW, h: this.rectH},
      bounds: {w: this.rectW, h: this.rectH},
    }
    const maxW = Math.min(340, Math.max(80, surfaceFrame.bounds.w - 12))
    const maxLabelW = Math.max(1, maxW - padX * 2)
    const maxLines = Math.max(1, Math.min(8, Math.floor((Math.max(24, surfaceFrame.bounds.h) - padY * 2) / lineHeight)))
    const lines = wrapUiTooltipLabel(label, maxLabelW, (value) => this.measureText(value, fontPx), maxLines)
    const labelW = Math.min(maxLabelW, Math.max(...lines.map((line) => Math.ceil(this.measureText(line, fontPx)))))
    const tooltipW = labelW + padX * 2
    const tooltipH = lines.length * lineHeight + padY * 2
    const placement = anchor === "cursor"
      ? placeUiSurfaceTooltip({x: cursorX, y: cursorY}, {w: tooltipW, h: tooltipH}, surfaceFrame)
      : placeUiSurfaceHitTooltip({x, y, w, h}, {w: tooltipW, h: tooltipH}, surfaceFrame)
    this.drawRoundedRect(placement.x, placement.y, tooltipW, tooltipH, {
      radius: 7,
      fill: palette.bgElevated,
      border: palette.border,
      borderWidth: 1,
      z: Z.TEXT + 0.4,
    })
    for (const [index, line] of lines.entries()) {
      this.drawText(line, placement.x + padX, placement.y + padY + index * lineHeight, {
        fontPx,
        material: this.materials.text,
        maxWidthPx: labelW,
        z: Z.TEXT + 0.5,
        clip: false,
      })
    }
  }

  #flushPendingTooltipDraws(): void {
    const pending = this.#pendingTooltipDraws
    this.#pendingTooltipDraws = []
    if (pending.length === 0) return
    this.withLayer("overlay", () => {
      for (const tooltip of pending) this.#drawTooltipNow(tooltip)
    })
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
    this.#currentLayer().add(mesh)
  }

  /**
   * Draws one analytical rounded shadow around an original local rectangle.
   * The PlaneGeometry is expanded symmetrically by `spread + blur`, while the
   * RoundedRectMaterial keeps measuring the unexpanded inner shape. A zero
   * total expansion is a no-op instead of an occluded ordinary fill draw.
   */
  drawRoundedShadow(
    x: number,
    y: number,
    w: number,
    h: number,
    opts: {
      radius: number | {tl: number; tr: number; br: number; bl: number}
      blur: number
      spread: number
      color: Color
      opacity?: number
      z?: number
    },
  ): void {
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return
    const boundedSize = (value: number): number => Number.isFinite(value) ? Math.max(0, value) : 0
    const blur = boundedSize(opts.blur)
    const spread = boundedSize(opts.spread)
    const padding = blur + spread
    if (padding <= 0) return
    const paddedWidth = w + padding * 2
    const paddedHeight = h + padding * 2
    if (![padding, paddedWidth, paddedHeight].every(Number.isFinite)) return
    const ps = this.pixelScale
    const radiusMax = Math.min(w, h) / 2
    const boundedRadius = (value: number): number => Math.min(radiusMax, boundedSize(value)) * ps
    const radius = typeof opts.radius === "number"
      ? boundedRadius(opts.radius)
      : {
          tl: boundedRadius(opts.radius.tl),
          tr: boundedRadius(opts.radius.tr),
          br: boundedRadius(opts.radius.br),
          bl: boundedRadius(opts.radius.bl),
        }
    const material = new RoundedRectMaterial({
      width: w * ps,
      height: h * ps,
      radius,
      fill: opts.color,
      border: null,
      opacity: clamp01(opts.opacity ?? 1),
      shadowBlur: blur * ps,
      shadowSpread: spread * ps,
    })
    this.#applyRoundedClipTo(material)
    const mesh = new Mesh(
      new PlaneGeometry({
        width: paddedWidth * ps,
        height: paddedHeight * ps,
      }),
      material,
    )
    mesh.position.x = (x + w / 2) * ps
    mesh.position.y = -(y + h / 2) * ps
    mesh.position.z = opts.z !== undefined && Number.isFinite(opts.z) ? opts.z : Z.CONTAINER
    mesh.updateMatrix()
    this.#currentLayer().add(mesh)
  }

  /** Точное измерение ширины текста через font advance + letter-spacing.
   *  fontPx интерпретируется как reference-px (если referenceHeight задан) —
   *  возвращаемая ширина уже в canvas-px (после умножения на pageScaleFactor).
   */
  measureText(value: string, fontPx: number, letterSpacingPx?: number, spaceAdvancePx?: number): number {
    if (this.font === null) return 0
    const f = this.font
    const fontPxCanvas = fontPx * this.pageScaleFactor
    const scale = fontPxCanvas / f.unitsPerEm
    const letterSpacing = letterSpacingPx === undefined
      ? fontPxCanvas * 0.05
      : letterSpacingPx * this.pageScaleFactor
    const spaceAdvance = spaceAdvancePx === undefined
      ? f.unitsPerEm * 0.3 * scale
      : spaceAdvancePx * this.pageScaleFactor
    let w = 0
    for (const ch of value) {
      if (ch === " ") {
        w += spaceAdvance
        continue
      }
      const gid = f.mapCharToGlyph(ch.codePointAt(0)!)
      const m = f.getHMetric(gid)
      w += m.advanceWidth * scale + letterSpacing
    }
    return w
  }

  /** Текущее pointer-состояние hit-rect'а. Нужно immediate-mode виджетам. */
  hitState(x: number, y: number, w: number, h: number, key?: string): HitState {
    const hitKey = key ?? hitKeyFor(x, y, w, h)
    return {
      hovered: this.#hoveredHitKey === hitKey,
      pressed: this.#pressedHitKey === hitKey,
    }
  }

  /** Pointer inside the hovered hit: retained-parent local or immediate surface coordinates. */
  hoveredPointer(): Readonly<{x: number; y: number}> | null {
    if (this.#hoveredHitKey === null) return null
    const hovered = this.hoveredHit as ResolvedHitBox | null
    if (hovered?.retainedParent !== undefined) {
      return this.surfaceToRetainedPoint(hovered.retainedParent, {x: this.#pointerX, y: this.#pointerY})
    }
    return {x: this.#pointerX, y: this.#pointerY}
  }

  /** Регистрирует hit-rect в surface-px coords. Поздние побеждают. */
  hit(
    x: number,
    y: number,
    w: number,
    h: number,
    action: () => void,
    cursorOrOptions: string | HitOptions = "pointer",
    tooltip?: TooltipHit,
  ): void {
    const options: HitOptions =
      typeof cursorOrOptions === "string"
        ? tooltip === undefined
          ? {cursor: cursorOrOptions}
          : {cursor: cursorOrOptions, tooltip}
        : cursorOrOptions
    const transaction = this.#retainedMaterialization
    if (transaction !== null) {
      this.#stageRetainedHit(transaction.target, x, y, w, h, action, options)
      return
    }
    const hit: HitBox = {
      x,
      y,
      w,
      h,
      key: options.key ?? hitKeyFor(x, y, w, h),
      action,
      cursor: options.cursor ?? "pointer",
    }
    if (options.activeCursor !== undefined) hit.activeCursor = options.activeCursor
    if (options.tooltip !== undefined) hit.tooltip = options.tooltip
    if (options.onPointerEnter !== undefined) hit.onPointerEnter = options.onPointerEnter
    if (options.onPointerLeave !== undefined) hit.onPointerLeave = options.onPointerLeave
    if (options.onPointerDown !== undefined) hit.onPointerDown = options.onPointerDown
    if (options.onPointerMove !== undefined) hit.onPointerMove = options.onPointerMove
    if (options.onPointerUp !== undefined) hit.onPointerUp = options.onPointerUp
    this.#hits.push(hit)
  }

  /** Регистрирует wheel-rect в surface-px coords. Поздние побеждают. */
  wheel(x: number, y: number, w: number, h: number, onWheel: (event: WheelEvent) => void, key?: string): void {
    const transaction = this.#retainedMaterialization
    if (transaction !== null) {
      if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0) {
        throw new Error("A retained wheel hit requires a finite non-negative local rect")
      }
      transaction.wheelHits.push({
        parent: transaction.target,
        x,
        y,
        w,
        h,
        key: key ?? hitKeyFor(x, y, w, h),
        onWheel,
      })
      transaction.renderKeys.add(key ?? hitKeyFor(x, y, w, h))
      return
    }
    this.#wheelHits.push({
      x,
      y,
      w,
      h,
      key: key ?? hitKeyFor(x, y, w, h),
      onWheel,
    })
  }

  // ────────────────────────── Pointer events ──────────────────────────

  onWheel(event: WheelEvent, localX: number, localY: number): void {
    this.dispatchWheelHit(event, localX - this.#padLeft, localY - this.#padTop)
  }

  protected dispatchWheelHit(event: WheelEvent, innerX: number, innerY: number): boolean {
    const hit = this.#wheelHitAt(innerX, innerY)
    if (hit === null) return false
    const retained = hit as ResolvedWheelHitBox
    if (retained.retainedParent !== undefined) this.#notifyRetainedInteraction(retained.retainedParent, retained.key)
    hit.onWheel(event)
    return true
  }

  onPointerMove(_event: MouseEvent, localX: number, localY: number): void {
    if (this.canvas === null) return
    this.#pointerX = localX - this.#padLeft
    this.#pointerY = localY - this.#padTop
    if (this.pressedHit !== null) {
      const pressed = this.pressedHit as ResolvedHitBox
      if (pressed.retainedParent !== undefined) this.#notifyRetainedInteraction(pressed.retainedParent, pressed.key)
      this.pressedHit.onPointerMove?.(localX - this.#padLeft, localY - this.#padTop, _event)
      this.canvas.canvas.style.cursor = this.#cursorFor(this.pressedHit, true)
      return
    }
    // Pointermove приходит в surface-rect-local; #hits зарегистрированы в inner-coords
    // (после сдвига на padding) — субтрагируем padLeft/padTop.
    const hit = this.#hitAt(localX - this.#padLeft, localY - this.#padTop)
    this.canvas.canvas.style.cursor = this.#cursorFor(hit, false)
    this.#setHoveredHit(hit)
    const nextTooltipKey = hit?.tooltip === undefined ? null : tooltipKey(hit.x, hit.y, hit.w, hit.h, hit.tooltip.label)
    if (nextTooltipKey !== this.#hoverTooltipKey) this.#setHoverTooltip(hit)
  }

  onPointerDown(_event: MouseEvent, localX: number, localY: number): void {
    const hit = this.#hitAt(localX - this.#padLeft, localY - this.#padTop)
    if (hit === null) return
    this.pressedHit = hit
    this.#pressedHitKey = hit.key
    const retained = hit as ResolvedHitBox
    if (retained.retainedParent !== undefined) this.#notifyRetainedInteraction(retained.retainedParent, retained.key)
    hit.onPointerDown?.(localX - this.#padLeft, localY - this.#padTop, _event)
    if (this.canvas !== null) this.canvas.canvas.style.cursor = this.#cursorFor(hit, true)
    this.requestRender()
  }

  onPointerUp(_event: MouseEvent, localX: number, localY: number): void {
    const pressed = this.pressedHit
    if (pressed === null) return
    const releaseHit = this.#hitAt(localX - this.#padLeft, localY - this.#padTop)
    this.pressedHit = null
    this.#pressedHitKey = null
    const retained = pressed as ResolvedHitBox
    if (retained.retainedParent !== undefined) this.#notifyRetainedInteraction(retained.retainedParent, retained.key)
    pressed.onPointerUp?.(_event)
    if (releaseHit?.key === pressed.key) {
      pressed.action()
    }
    if (this.canvas !== null) this.canvas.canvas.style.cursor = this.#cursorFor(releaseHit, false)
    this.requestRender()
  }

  onContextMenu(_event: MouseEvent, _localX: number, _localY: number): void {}

  #cursorFor(hit: HitBox | null | undefined, active: boolean): string {
    if (hit === null || hit === undefined) return "default"
    return active ? hit.activeCursor ?? hit.cursor : hit.cursor
  }

  onPointerLeave(): void {
    this.#setHoveredHit(null)
    this.#setHoverTooltip(null)
    if (this.canvas !== null) this.canvas.canvas.style.cursor = "default"
  }

  onDeactivate(): void {
    if (this.canvas !== null) this.canvas.canvas.style.cursor = "default"
    this.#setHoveredHit(null)
    const pressed = this.pressedHit as ResolvedHitBox | null
    if (pressed?.retainedParent !== undefined) this.#notifyRetainedInteraction(pressed.retainedParent, pressed.key)
    this.pressedHit = null
    this.#pressedHitKey = null
    this.#setHoverTooltip(null)
  }

  dispose(): void {
    this.#cancelPendingRerender()
    this.#cancelPendingKeyedRerender()
    this.#cancelPendingLayerRerender()
    this.#hits = []
    this.#wheelHits = []
    this.#setHoveredHit(null)
    this.pressedHit = null
    this.#pressedHitKey = null
    this.#setHoverTooltip(null)
    for (const layer of this.#contentLayers()) this.#clearLayer(layer)
    this.#clearLayer(this.#retainedLayer)
    this.#clearLayer(this.#backgroundLayer)
  }

  // ────────────────────────── Internal ──────────────────────────

  #syncChrome(fullW = this.rectW + this.#padLeft + this.#padRight, fullH = this.rectH + this.#padTop + this.#padBottom): void {
    const ps = this.pixelScale
    const w = fullW
    const h = fullH
    const borderColor = this.#active && this.#borderColor !== null ? palette.windowActiveBorder : this.#borderColor

    if (this.#roundedChrome !== null) {
      this.#replaceGeometry(this.#roundedChrome, new PlaneGeometry({width: w * ps, height: h * ps}))
      this.#roundedChrome.material = new RoundedRectMaterial({
        width: w * ps,
        height: h * ps,
        radius: Math.min(this.#borderRadiusPx, Math.min(w, h) / 2) * ps,
        fill: this.#bgColor ?? new Color(1, 1, 1, 0),
        border: borderColor,
        borderWidth: this.#borderWidthPx * ps,
      })
      this.#roundedChrome.position.x = (w / 2) * ps
      this.#roundedChrome.position.y = -(h / 2) * ps
      this.#roundedChrome.updateMatrix()
    }

    if (this.#bg !== null) {
      this.#replaceGeometry(this.#bg, new PlaneGeometry({width: w * ps, height: h * ps}))
      this.#bg.position.x = (w / 2) * ps
      this.#bg.position.y = -(h / 2) * ps
      this.#bg.updateMatrix()
    }

    if (this.#borderTop !== null) {
      for (const border of [this.#borderTop, this.#borderBottom!, this.#borderLeft!, this.#borderRight!]) {
        if (border.material instanceof MeshBasicMaterial) border.material.color = borderColor?.clone() ?? palette.transparent.clone()
      }
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
        -0.18,
        false,
      )
    }
    for (const layer of this.#contentLayers()) this.#clearLayer(layer)
    this.#hits = []
    this.#wheelHits = []
    this.#pendingTooltipDraws = []
    this.#clipStack = [{xMin: 0, yMin: 0, xMax: this.rectW, yMax: this.rectH}]
    this.render()
    this.#flushPendingTooltipDraws()
  }

  #rerenderNow(): void {
    this.#cancelPendingRerender()
    this.#cancelPendingLayerRerender()
    this.#rerender()
  }

  #currentLayer(): Object3D {
    if (this.#retainedMaterialization !== null) return this.#retainedMaterialization.staging
    return this.#layerObject(this.#drawLayer)
  }

  #layerObject(layer: UiSurfaceDrawLayer): Object3D {
    switch (layer) {
      case "underlay":
        return this.#underlayLayer
      case "contentUnderlay":
        return this.#contentUnderlayLayer
      case "selection":
        return this.#selectionLayer
      case "overlay":
        return this.#overlayLayer
      case "main":
        return this.#layer
    }
  }

  #contentLayers(): readonly Object3D[] {
    return [this.#underlayLayer, this.#contentUnderlayLayer, this.#selectionLayer, this.#layer, this.#overlayLayer]
  }

  #positionedLayers(): readonly Object3D[] {
    return [...this.#contentLayers(), this.#retainedLayer]
  }

  #redrawRequestedLayers(): void {
    if (this.#layerRerenderRafId !== null) {
      cancelUiFrame(this.#layerRerenderRafId)
      this.#layerRerenderRafId = null
    }
    const draw = this.#layerRerenderDraw
    const layers = [...this.#layerRerenderLayers]
    this.#layerRerenderLayers.clear()
    this.#layerRerenderDraw = null
    if (this.font === null || draw === null) return
    for (const layer of layers) this.#clearLayer(this.#layerObject(layer))
    this.#clipStack = [{xMin: 0, yMin: 0, xMax: this.rectW, yMax: this.rectH}]
    draw()
  }

  #cancelPendingRerender(): void {
    if (this.#rerenderRafId === null) return
    cancelUiFrame(this.#rerenderRafId)
    this.#rerenderRafId = null
  }

  #redrawKeyedRetainedParents(): void {
    if (this.#keyedRerenderRafId !== null) {
      cancelUiFrame(this.#keyedRerenderRafId)
      this.#keyedRerenderRafId = null
    }
    const parents = [...this.#keyedRerenderParents]
    this.#keyedRerenderParents.clear()
    if (this.font === null) return
    for (const [index, parent] of parents.entries()) {
      if (!this.#retainedParents.has(parent)) continue
      const draw = this.#retainedDraws.get(parent)
      if (draw === undefined) continue
      try {
        this.materializeRetainedParent(parent, draw)
      } catch (error) {
        for (const pending of parents.slice(index)) {
          if (this.#retainedParents.has(pending)) this.#keyedRerenderParents.add(pending)
        }
        throw error
      }
    }
  }

  #cancelPendingKeyedRerender(): void {
    if (this.#keyedRerenderRafId !== null) {
      cancelUiFrame(this.#keyedRerenderRafId)
      this.#keyedRerenderRafId = null
    }
    this.#keyedRerenderParents.clear()
  }

  #cancelPendingLayerRerender(): void {
    if (this.#layerRerenderRafId !== null) {
      cancelUiFrame(this.#layerRerenderRafId)
      this.#layerRerenderRafId = null
    }
    this.#layerRerenderLayers.clear()
    this.#layerRerenderDraw = null
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
      ...(opts.tint === undefined ? {} : {tint: opts.tint}),
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
   * Сужает текущий clip-rect на пересечение с (x, y, w, h) в surface-local-px.
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
    this.#tagClipBounds(text as Text & ClipBoundsHost, clip)
  }

  #applyImageClipTo(material: ImageMaterial): void {
    const clip = this.#clipStack[this.#clipStack.length - 1]!
    this.#tagClipBounds(material as ImageMaterial & ClipBoundsHost, clip)
  }

  #applyBasicClipTo(material: MeshBasicMaterial): void {
    const clip = this.#clipStack[this.#clipStack.length - 1]!
    if (this.#retainedMaterialization === null && this.#isCompleteSurfaceClip(clip)) return
    this.#tagClipBounds(material as MeshBasicMaterial & ClipBoundsHost, clip)
  }

  #applyRoundedClipTo(material: RoundedRectMaterial): void {
    const clip = this.#clipStack[this.#clipStack.length - 1]!
    // Если clipStack — это вся surface-rect (без активного pushClip), оставляем
    // zeros — шейдер их детектит и skip'ает scissor (быстрее).
    if (this.#retainedMaterialization === null && this.#isCompleteSurfaceClip(clip)) return
    this.#tagClipBounds(material as RoundedRectMaterial & ClipBoundsHost, clip)
  }

  #applyColorPickerClipTo(material: ColorPickerMaterial): void {
    const clip = this.#clipStack[this.#clipStack.length - 1]!
    if (this.#retainedMaterialization === null && this.#isCompleteSurfaceClip(clip)) return
    this.#tagClipBounds(material as ColorPickerMaterial & ClipBoundsHost, clip)
  }

  #tagClipBounds(host: ClipBoundsHost, clip: ClipLocalRect): void {
    const transaction = this.#retainedMaterialization
    const evidence: ClipEvidence = transaction === null
      ? {space: "surface", local: {...clip}}
      : {
          space: "retained",
          parent: transaction.target,
          local: isUnboundedClip(clip) ? null : {...clip},
        }
    host[CLIP_EVIDENCE] = evidence
    host.clipBounds = this.#clipBoundsForEvidence(evidence)
  }

  #clipBoundsForLocal(clip: ClipLocalRect): [number, number, number, number] {
    return this.#framebufferClipBoundsForInner(clip)
  }

  #clipBoundsForEvidence(evidence: ClipEvidence): [number, number, number, number] {
    if (evidence.space === "surface") return this.#clipBoundsForLocal(evidence.local)
    let clip = this.#retainedViewportClip(evidence.parent)
    if (evidence.local !== null) {
      const localRect = clipLocalRectToSurfaceRect(evidence.local)
      clip = intersectClipRects(clip, normaliseClipRect(this.retainedToSurfaceRect(evidence.parent, localRect)))
    }
    return this.#framebufferClipBoundsForInner(clip)
  }

  #framebufferClipBoundsForInner(clip: ClipLocalRect): [number, number, number, number] {
    const ox = this.#screenOriginX + this.#padLeft
    const oy = this.#screenOriginY + this.#padTop
    // Screen-pixel scissor (framebuffer-pixels). Runtime учитывает pixelRatio
    // и transform виртуального дисплея, если surface отрисован не 1:1 на canvas.
    return this.#uiRectToFramebufferClipBounds(
      ox + clip.xMin,
      oy + clip.yMin,
      ox + clip.xMax,
      oy + clip.yMax,
    )
  }

  #refreshClipBounds(): void {
    for (const layer of [this.#backgroundLayer, ...this.#contentLayers(), this.#retainedLayer]) {
      this.#refreshClipBoundsForObject(layer)
    }
  }

  #refreshClipBoundsForObject(obj: Object3D): void {
    const text = obj as Text & ClipBoundsHost
    if (text.isText === true && text[CLIP_EVIDENCE] !== undefined) {
      text.clipBounds = this.#clipBoundsForEvidence(text[CLIP_EVIDENCE])
    }

    const material = (obj as {material?: unknown}).material as (ClipBoundsHost | undefined)
    if (material?.[CLIP_EVIDENCE] !== undefined) {
      material.clipBounds = this.#clipBoundsForEvidence(material[CLIP_EVIDENCE])
    }

    for (const child of obj.children) this.#refreshClipBoundsForObject(child)
  }

  #isCompleteSurfaceClip(clip: ClipLocalRect): boolean {
    return clip.xMin === 0 && clip.yMin === 0 && clip.xMax === this.rectW && clip.yMax === this.rectH
  }

  #uiRectToFramebufferClipBounds(xMin: number, yMin: number, xMax: number, yMax: number): [number, number, number, number] {
    const dpr = this.canvas?.renderer.pixelRatio ?? 1
    if (this.canvas === null || this.#framebufferClipSpace === "screen") {
      return [
        Math.min(xMin, xMax) * dpr,
        Math.min(yMin, yMax) * dpr,
        Math.max(xMin, xMax) * dpr,
        Math.max(yMin, yMax) * dpr,
      ]
    }
    return this.canvas.uiRectToFramebufferClipBounds(xMin, yMin, xMax, yMax, this.#framebufferDisplayId)
  }

  #hitAt(x: number, y: number): HitBox | null {
    const retained = this.#retainedHitAt(x, y)
    if (retained !== null) return retained
    for (let i = this.#hits.length - 1; i >= 0; i--) {
      const h = this.#hits[i]!
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h
    }
    return null
  }

  #retainedHitAt(x: number, y: number): ResolvedHitBox | null {
    const records = this.#retainedRecordsInPaintOrder(this.#retainedHits)
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index]!
      const viewport = this.#retainedViewportClip(record.parent)
      if (!pointInsideClip({x, y}, viewport)) continue
      const localPoint = this.surfaceToRetainedPoint(record.parent, {x, y})
      const intrinsic = pointInsideRect(localPoint, record)
      const projected = this.retainedToSurfaceRect(record.parent, record)
      const target = expandRectToMinimum(projected, record.screenMinimum)
      if (!intrinsic && (record.screenMinimum === undefined || !pointInsideRect({x, y}, target))) continue
      return this.#resolveRetainedHit(record, target)
    }
    return null
  }

  #resolveRetainedHit(record: RetainedHitRecord, target?: UiSurfaceRect): ResolvedHitBox {
    const projected = target ?? expandRectToMinimum(
      this.retainedToSurfaceRect(record.parent, record),
      record.screenMinimum,
    )
    const resolved: ResolvedHitBox = {
      x: projected.x,
      y: projected.y,
      w: projected.w,
      h: projected.h,
      key: record.key,
      action: record.action,
      cursor: record.cursor,
      retainedParent: record.parent,
    }
    if (record.activeCursor !== undefined) resolved.activeCursor = record.activeCursor
    if (record.tooltip !== undefined) resolved.tooltip = record.tooltip
    if (record.onPointerEnter !== undefined) resolved.onPointerEnter = record.onPointerEnter
    if (record.onPointerLeave !== undefined) resolved.onPointerLeave = record.onPointerLeave
    if (record.onPointerDown !== undefined) {
      resolved.onPointerDown = (surfaceX, surfaceY, event) => {
        const point = this.surfaceToRetainedPoint(record.parent, {x: surfaceX, y: surfaceY})
        record.onPointerDown?.(point.x, point.y, event)
      }
    }
    if (record.onPointerMove !== undefined) {
      resolved.onPointerMove = (surfaceX, surfaceY, event) => {
        const point = this.surfaceToRetainedPoint(record.parent, {x: surfaceX, y: surfaceY})
        record.onPointerMove?.(point.x, point.y, event)
      }
    }
    if (record.onPointerUp !== undefined) resolved.onPointerUp = record.onPointerUp
    return resolved
  }

  #wheelHitAt(x: number, y: number): WheelHitBox | null {
    const retained = this.#retainedWheelHitAt(x, y)
    if (retained !== null) return retained
    for (let i = this.#wheelHits.length - 1; i >= 0; i--) {
      const h = this.#wheelHits[i]!
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h
    }
    return null
  }

  #retainedWheelHitAt(x: number, y: number): ResolvedWheelHitBox | null {
    const records = this.#retainedRecordsInPaintOrder(this.#retainedWheelHits)
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index]!
      const viewport = this.#retainedViewportClip(record.parent)
      if (!pointInsideClip({x, y}, viewport)) continue
      const localPoint = this.surfaceToRetainedPoint(record.parent, {x, y})
      if (!pointInsideRect(localPoint, record)) continue
      const projected = this.retainedToSurfaceRect(record.parent, record)
      return {
        x: projected.x,
        y: projected.y,
        w: projected.w,
        h: projected.h,
        key: record.key,
        onWheel: record.onWheel,
        retainedParent: record.parent,
      }
    }
    return null
  }

  #retainedRecordsInPaintOrder<T>(records: ReadonlyMap<Object3D, readonly T[]>): T[] {
    const ordered: T[] = []
    const visit = (object: Object3D): void => {
      if (!object.visible) return
      const owned = records.get(object)
      if (owned !== undefined) ordered.push(...owned)
      for (const child of object.children) visit(child)
    }
    visit(this.#retainedLayer)
    return ordered
  }

  #setHoverTooltip(hit: HitBox | null): void {
    if (this.#hoverTooltipTimer !== null) {
      clearTimeout(this.#hoverTooltipTimer)
      this.#hoverTooltipTimer = null
    }
    if (hit?.tooltip === undefined) {
      const hadTooltip = this.#hoverTooltipKey !== null
      this.#hoverTooltipKey = null
      this.#hoverTooltipSince = 0
      this.#hoverTooltipDelayMs = 0
      if (hadTooltip) this.requestRender()
      return
    }
    this.#hoverTooltipKey = tooltipKey(hit.x, hit.y, hit.w, hit.h, hit.tooltip.label)
    this.#hoverTooltipSince = performance.now()
    this.#hoverTooltipDelayMs = hit.tooltip.delayMs
    this.#hoverTooltipTimer = setTimeout(() => {
      this.#hoverTooltipTimer = null
      const hovered = this.hoveredHit as ResolvedHitBox | null
      if (hovered?.retainedParent !== undefined) this.#notifyRetainedInteraction(hovered.retainedParent, hovered.key)
      this.requestRender()
    }, this.#hoverTooltipDelayMs)
    this.requestRender()
  }

  #setHoveredHit(hit: HitBox | null): void {
    if (this.hoveredHit?.key === hit?.key) {
      this.hoveredHit = hit
      this.#hoveredHitKey = hit?.key ?? null
      return
    }
    const previous = this.hoveredHit as ResolvedHitBox | null
    previous?.onPointerLeave?.()
    this.hoveredHit = hit
    this.#hoveredHitKey = hit?.key ?? null
    hit?.onPointerEnter?.()
    const next = hit as ResolvedHitBox | null
    if (previous?.retainedParent !== undefined) {
      this.#notifyRetainedInteraction(previous.retainedParent, previous.key)
    }
    if (next?.retainedParent !== undefined && next.retainedParent !== previous?.retainedParent) {
      this.#notifyRetainedInteraction(next.retainedParent, next.key)
    } else if (next?.retainedParent !== undefined) {
      this.#lastRetainedInteraction = {key: next.key, parent: next.retainedParent}
    }
    this.requestRender()
  }

  #requireRetainedParent(parent: Object3D): void {
    if (!this.#retainedParents.has(parent)) {
      throw new Error("Retained parent is not owned by this UiSurface")
    }
  }

  #updateRetainedMatrices(): void {
    this.node.updateWorldMatrix()
  }

  #convertRect(
    rect: UiSurfaceRect,
    convert: (point: Readonly<{x: number; y: number}>) => Readonly<{x: number; y: number}>,
  ): UiSurfaceRect {
    const points = [
      convert({x: rect.x, y: rect.y}),
      convert({x: rect.x + rect.w, y: rect.y}),
      convert({x: rect.x + rect.w, y: rect.y + rect.h}),
      convert({x: rect.x, y: rect.y + rect.h}),
    ]
    const xs = points.map(({x}) => x)
    const ys = points.map(({y}) => y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return {x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y}
  }

  #retainedViewportClip(parent: Object3D): ClipLocalRect {
    let clip: ClipLocalRect = {xMin: 0, yMin: 0, xMax: this.rectW, yMax: this.rectH}
    let current: Object3D | null = parent
    while (current !== null && current !== this.#retainedLayer) {
      const owned = this.#retainedViewportClips.get(current)
      if (owned !== undefined) clip = intersectClipRects(clip, owned)
      current = current.parent
    }
    return clip
  }

  #replaceRetainedHits(parent: Object3D, hits: readonly RetainedHitRecord[]): void {
    const hovered = this.hoveredHit as ResolvedHitBox | null
    const pressed = this.pressedHit as ResolvedHitBox | null
    if (hits.length === 0) this.#retainedHits.delete(parent)
    else this.#retainedHits.set(parent, [...hits])

    if (hovered?.retainedParent === parent) {
      const next = this.#retainedHitAt(this.#pointerX, this.#pointerY)
      if (next?.retainedParent === parent && next.key === hovered.key) {
        this.hoveredHit = next
        this.#hoveredHitKey = next.key
        const tooltip = next.tooltip === undefined ? null : tooltipKey(next.x, next.y, next.w, next.h, next.tooltip.label)
        if (tooltip !== this.#hoverTooltipKey) this.#setHoverTooltip(next)
      } else {
        this.#setHoveredHit(null)
        this.#setHoverTooltip(null)
      }
    }

    if (pressed?.retainedParent === parent) {
      const replacement = hits.find((record) => record.key === pressed.key)
      if (replacement === undefined) {
        this.pressedHit = null
        this.#pressedHitKey = null
        if (this.canvas !== null) this.canvas.canvas.style.cursor = "default"
      } else {
        this.pressedHit = this.#resolveRetainedHit(replacement)
        this.#pressedHitKey = replacement.key
      }
    }
  }

  #replaceRetainedWheelHits(parent: Object3D, hits: readonly RetainedWheelHitRecord[]): void {
    if (hits.length === 0) this.#retainedWheelHits.delete(parent)
    else this.#retainedWheelHits.set(parent, [...hits])
  }

  #replaceRetainedRenderKeys(parent: Object3D, keys: ReadonlySet<string>): void {
    if (keys.size === 0) this.#retainedRenderKeys.delete(parent)
    else this.#retainedRenderKeys.set(parent, new Set(keys))
  }

  #retainedParentForKey(key: string): Object3D | null {
    let owner: Object3D | null = null
    for (const [parent, keys] of this.#retainedRenderKeys) {
      if (!keys.has(key)) continue
      if (owner !== null && owner !== parent) return null
      owner = parent
    }
    return owner
  }

  #notifyRetainedInteraction(parent: Object3D, key: string): void {
    if (!this.#retainedParents.has(parent)) return
    this.#lastRetainedInteraction = {key, parent}
    this.onRetainedInteractionChange(parent)
  }

  #releaseRetainedHitState(parent: Object3D): void {
    const hovered = this.hoveredHit as ResolvedHitBox | null
    if (hovered?.retainedParent === parent) {
      this.#setHoveredHit(null)
      this.#setHoverTooltip(null)
    }
    const pressed = this.pressedHit as ResolvedHitBox | null
    if (pressed?.retainedParent === parent) {
      this.#notifyRetainedInteraction(parent, pressed.key)
      this.pressedHit = null
      this.#pressedHitKey = null
      if (this.canvas !== null) this.canvas.canvas.style.cursor = "default"
    }
  }

  #releaseRetainedHitStateForSubtree(root: Object3D): void {
    this.#releaseRetainedHitState(root)
    for (const child of root.children) this.#releaseRetainedHitStateForSubtree(child)
  }

  #clearLayer(layer: Object3D = this.#layer): void {
    this.#disposeChildren(layer)
  }

  #disposeChildren(parent: Object3D): void {
    this.#disposeSubtrees([...parent.children])
  }

  #disposeSubtrees(roots: readonly Object3D[]): void {
    const renderer = this.canvas?.renderer
    const geometries = new Set<BufferGeometry>()
    if (renderer !== undefined) {
      for (const geometry of Text.consumeEvictedLayoutGeometries()) geometries.add(geometry)
    }

    const disposeObject = (obj: Object3D): void => {
      for (const child of [...obj.children]) disposeObject(child)

      const text = obj as Text
      if (text.isText === true) {
        if (renderer !== undefined) {
          if (text.stencilGeometry !== undefined && !Text.isCachedLayoutGeometry(text.stencilGeometry)) {
            geometries.add(text.stencilGeometry)
          }
          if (text.coverGeometry !== undefined && !Text.isCachedLayoutGeometry(text.coverGeometry)) {
            geometries.add(text.coverGeometry)
          }
        }
      } else if (renderer !== undefined) {
        const geometry = (obj as {geometry?: BufferGeometry}).geometry
        if (geometry !== undefined) geometries.add(geometry)
      }

      obj.children = []
      obj.parent?.remove(obj)
      this.#releaseRetainedHitState(obj)
      this.#retainedHits.delete(obj)
      this.#retainedWheelHits.delete(obj)
      this.#retainedRenderKeys.delete(obj)
      this.#retainedDraws.delete(obj)
      this.#keyedRerenderParents.delete(obj)
      this.#retainedViewportClips.delete(obj)
      this.#retainedParents.delete(obj)
      if (this.#lastRetainedInteraction?.parent === obj) this.#lastRetainedInteraction = null
    }

    for (const root of roots) disposeObject(root)
    if (renderer !== undefined) {
      for (const geometry of geometries) renderer.invalidateGeometry(geometry)
    }
  }

  #fitText(value: string, maxPx: number, fontPx: number, letterSpacingPx?: number, spaceAdvancePx?: number): string {
    const fullW = this.measureText(value, fontPx, letterSpacingPx, spaceAdvancePx)
    // The Flex slot and the rendered glyph run are measured through the same
    // font metrics, but scaling changes floating-point operation order. Do not
    // turn a sub-pixel rounding difference into a visible ellipsis.
    const fitTolerancePx = 0.01
    if (fullW <= maxPx + fitTolerancePx) return value
    const ellipsis = "..."
    const ellipsisW = this.measureText(ellipsis, fontPx, letterSpacingPx, spaceAdvancePx)
    if (ellipsisW > maxPx) return ""
    let lo = 0
    let hi = value.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2)
      const sub = value.slice(0, mid)
      if (this.measureText(sub, fontPx, letterSpacingPx, spaceAdvancePx) + ellipsisW <= maxPx + fitTolerancePx) lo = mid
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

function normaliseClipRect(rect: UiSurfaceRect): ClipLocalRect {
  const x0 = Math.min(rect.x, rect.x + rect.w)
  const y0 = Math.min(rect.y, rect.y + rect.h)
  const x1 = Math.max(rect.x, rect.x + rect.w)
  const y1 = Math.max(rect.y, rect.y + rect.h)
  return {xMin: x0, yMin: y0, xMax: x1, yMax: y1}
}

function sameClipRect(left: ClipLocalRect, right: ClipLocalRect): boolean {
  return left.xMin === right.xMin && left.yMin === right.yMin &&
    left.xMax === right.xMax && left.yMax === right.yMax
}

function isUnboundedClip(clip: ClipLocalRect): boolean {
  return clip.xMin === Number.NEGATIVE_INFINITY && clip.yMin === Number.NEGATIVE_INFINITY &&
    clip.xMax === Number.POSITIVE_INFINITY && clip.yMax === Number.POSITIVE_INFINITY
}

function clipLocalRectToSurfaceRect(clip: ClipLocalRect): UiSurfaceRect {
  return {x: clip.xMin, y: clip.yMin, w: clip.xMax - clip.xMin, h: clip.yMax - clip.yMin}
}

function intersectClipRects(left: ClipLocalRect, right: ClipLocalRect): ClipLocalRect {
  const xMin = Math.max(left.xMin, right.xMin)
  const yMin = Math.max(left.yMin, right.yMin)
  return {
    xMin,
    yMin,
    xMax: Math.max(xMin, Math.min(left.xMax, right.xMax)),
    yMax: Math.max(yMin, Math.min(left.yMax, right.yMax)),
  }
}

function pointInsideClip(point: Readonly<{x: number; y: number}>, clip: ClipLocalRect): boolean {
  return point.x >= clip.xMin && point.x <= clip.xMax && point.y >= clip.yMin && point.y <= clip.yMax
}

function pointInsideRect(
  point: Readonly<{x: number; y: number}>,
  rect: Readonly<{x: number; y: number; w: number; h: number}>,
): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
}

function expandRectToMinimum(
  rect: UiSurfaceRect,
  minimum: RetainedHitScreenMinimum | undefined,
): UiSurfaceRect {
  if (minimum === undefined) return rect
  const w = Math.max(rect.w, minimum.width)
  const h = Math.max(rect.h, minimum.height)
  return {
    x: rect.x + (rect.w - w) / 2,
    y: rect.y + (rect.h - h) / 2,
    w,
    h,
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

function tooltipKey(x: number, y: number, w: number, h: number, label: string): string {
  return `${Math.round(x)}:${Math.round(y)}:${Math.round(w)}:${Math.round(h)}:${label}`
}

/** Default top, then right/bottom/left when the browser/surface edge blocks it. */
export function placeUiCursorTooltip(
  cursor: Readonly<{x: number; y: number}>,
  tooltip: Readonly<{w: number; h: number}>,
  bounds: Readonly<{w: number; h: number}>,
  gap = 12,
  margin = 4,
): UiCursorTooltipPlacement {
  const maxX = Math.max(margin, bounds.w - tooltip.w - margin)
  const maxY = Math.max(margin, bounds.h - tooltip.h - margin)
  const clampX = (value: number): number => Math.max(margin, Math.min(maxX, value))
  const clampY = (value: number): number => Math.max(margin, Math.min(maxY, value))
  if (cursor.y - gap - tooltip.h >= margin) {
    return {x: clampX(cursor.x - tooltip.w / 2), y: cursor.y - gap - tooltip.h, side: "top"}
  }
  if (cursor.x + gap + tooltip.w <= bounds.w - margin) {
    return {x: cursor.x + gap, y: clampY(cursor.y - tooltip.h / 2), side: "right"}
  }
  if (cursor.y + gap + tooltip.h <= bounds.h - margin) {
    return {x: clampX(cursor.x - tooltip.w / 2), y: cursor.y + gap, side: "bottom"}
  }
  if (cursor.x - gap - tooltip.w >= margin) {
    return {x: cursor.x - gap - tooltip.w, y: clampY(cursor.y - tooltip.h / 2), side: "left"}
  }
  return {x: clampX(cursor.x - tooltip.w / 2), y: clampY(cursor.y - gap - tooltip.h), side: "top"}
}

/** Place an overflowing surface tooltip inside the complete browser/display viewport. */
export function placeUiSurfaceTooltip(
  localAnchor: Readonly<{x: number; y: number}>,
  tooltip: Readonly<{w: number; h: number}>,
  frame: Readonly<{rect: UiSurfaceRect; bounds: {w: number; h: number}}>,
  gap = 12,
  margin = 4,
): UiCursorTooltipPlacement {
  const placement = placeUiCursorTooltip({
    x: frame.rect.x + localAnchor.x,
    y: frame.rect.y + localAnchor.y,
  }, tooltip, frame.bounds, gap, margin)
  return {
    x: placement.x - frame.rect.x,
    y: placement.y - frame.rect.y,
    side: placement.side,
  }
}

/** Default top, then right/bottom/left, with a real gap from the complete hit rectangle. */
export function placeUiHitTooltip(
  hit: UiSurfaceRect,
  tooltip: Readonly<{w: number; h: number}>,
  bounds: Readonly<{w: number; h: number}>,
  gap = 12,
  margin = 4,
): UiCursorTooltipPlacement {
  const maxX = Math.max(margin, bounds.w - tooltip.w - margin)
  const maxY = Math.max(margin, bounds.h - tooltip.h - margin)
  const clampX = (value: number): number => Math.max(margin, Math.min(maxX, value))
  const clampY = (value: number): number => Math.max(margin, Math.min(maxY, value))
  const centeredX = hit.x + hit.w / 2 - tooltip.w / 2
  const centeredY = hit.y + hit.h / 2 - tooltip.h / 2
  if (hit.y - gap - tooltip.h >= margin) {
    return {x: clampX(centeredX), y: hit.y - gap - tooltip.h, side: "top"}
  }
  if (hit.x + hit.w + gap + tooltip.w <= bounds.w - margin) {
    return {x: hit.x + hit.w + gap, y: clampY(centeredY), side: "right"}
  }
  if (hit.y + hit.h + gap + tooltip.h <= bounds.h - margin) {
    return {x: clampX(centeredX), y: hit.y + hit.h + gap, side: "bottom"}
  }
  if (hit.x - gap - tooltip.w >= margin) {
    return {x: hit.x - gap - tooltip.w, y: clampY(centeredY), side: "left"}
  }
  return placeUiCursorTooltip(
    {x: hit.x + hit.w / 2, y: hit.y + hit.h / 2},
    tooltip,
    bounds,
    gap,
    margin,
  )
}

export function placeUiSurfaceHitTooltip(
  localHit: UiSurfaceRect,
  tooltip: Readonly<{w: number; h: number}>,
  frame: Readonly<{rect: UiSurfaceRect; bounds: {w: number; h: number}}>,
  gap = 12,
  margin = 4,
): UiCursorTooltipPlacement {
  const placement = placeUiHitTooltip({
    x: frame.rect.x + localHit.x,
    y: frame.rect.y + localHit.y,
    w: localHit.w,
    h: localHit.h,
  }, tooltip, frame.bounds, gap, margin)
  return {
    x: placement.x - frame.rect.x,
    y: placement.y - frame.rect.y,
    side: placement.side,
  }
}

export function wrapUiTooltipLabel(
  label: string,
  maxWidth: number,
  measureText: (value: string) => number,
  maxLines = 8,
): readonly string[] {
  const safeWidth = Math.max(1, maxWidth)
  const safeMaxLines = Math.max(1, Math.floor(maxLines))
  const pending = label.split("\n")
  const lines: string[] = []
  while (pending.length > 0 && lines.length < safeMaxLines) {
    let remaining = pending.shift() ?? ""
    if (remaining.length === 0) {
      lines.push("")
      continue
    }
    while (remaining.length > 0 && lines.length < safeMaxLines) {
      if (measureText(remaining) <= safeWidth) {
        lines.push(remaining)
        remaining = ""
        continue
      }
      let end = longestFittingPrefix(remaining, safeWidth, measureText)
      const softBreak = findTooltipSoftBreak(remaining, end)
      if (softBreak > Math.floor(end * 0.55)) end = softBreak
      const line = remaining.slice(0, end).trimEnd()
      lines.push(line.length > 0 ? line : remaining.slice(0, Math.max(1, end)))
      remaining = remaining.slice(end).trimStart()
    }
    if (remaining.length > 0) pending.unshift(remaining)
  }
  if (pending.length > 0) {
    const last = lines.at(-1) ?? ""
    lines[lines.length - 1] = fitTooltipEllipsis(last, safeWidth, measureText)
  }
  return lines.length > 0 ? lines : [""]
}

function longestFittingPrefix(value: string, maxWidth: number, measureText: (value: string) => number): number {
  let low = 1
  let high = value.length
  let best = 1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (measureText(value.slice(0, middle)) <= maxWidth) {
      best = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return best
}

function findTooltipSoftBreak(value: string, limit: number): number {
  for (let index = Math.min(limit, value.length - 1); index > 0; index--) {
    if (/\s/.test(value[index - 1] ?? "")) return index
  }
  return limit
}

function fitTooltipEllipsis(value: string, maxWidth: number, measureText: (value: string) => number): string {
  const ellipsis = "…"
  if (measureText(`${value}${ellipsis}`) <= maxWidth) return `${value}${ellipsis}`
  let end = value.length
  while (end > 0 && measureText(`${value.slice(0, end)}${ellipsis}`) > maxWidth) end--
  return `${value.slice(0, end)}${ellipsis}`
}

function hitKeyFor(x: number, y: number, w: number, h: number): string {
  return `${Math.round(x)}:${Math.round(y)}:${Math.round(w)}:${Math.round(h)}`
}

function normaliseTextBlockLines(value: string | readonly string[], upper: boolean): string[] {
  const lines = typeof value === "string" ? value.split("\n") : [...value]
  return lines.map((line) => (upper ? line.toUpperCase() : line))
}

function layoutTextBlockLines(surface: UiSurface, rawLines: readonly string[], maxW: number, fontPx: number, wrap: boolean): string[] {
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
      if (surface.measureText(candidate, fontPx) <= maxW || line.length === 0) {
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

function maxTextBlockLineWidth(surface: UiSurface, lines: readonly string[], fontPx: number): number {
  let max = 0
  for (const line of lines) max = Math.max(max, surface.measureText(line, fontPx))
  return max
}
