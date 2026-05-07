/**
 * Card — базовый class для UI-карточек поверх UiCanvas.
 *
 * ГАРАНТИИ:
 *  • Background и border всегда внутри card-rect — не вылазят за границы.
 *  • Bg/border меши ВЛАДЕНЫ Card. Subclass их не трогает.
 *  • drawText обрезается через ИЗМЕРЕНИЕ font.getHMetric (font advance +
 *    letterSpacing 5%) — точное, не estimate. Бинарный поиск с "...".
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
 */

import {
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Text,
  TextMaterial,
  TrueTypeFont,
  type BufferGeometry,
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

export type CardOpts = {
  bgColor?: Color | null
  /** null = без рамки. Default — серая 1px. */
  borderColor?: Color | null
  borderWidthPx?: number
}

export type DrawTextOpts = {
  fontPx: number
  material: TextMaterial
  /** Гарантия: текст обрезается через измерение и "...". */
  maxWidthPx?: number
  z?: number
}

const DEFAULT_BG = new Color(18 / 255, 23 / 255, 32 / 255, 0.96)
const DEFAULT_BORDER = new Color(62 / 255, 74 / 255, 92 / 255, 1)

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

  readonly #bg: Mesh | null
  readonly #borderTop: Mesh | null
  readonly #borderBottom: Mesh | null
  readonly #borderLeft: Mesh | null
  readonly #borderRight: Mesh | null
  readonly #borderWidthPx: number
  readonly #layer: Object3D
  #hits: HitBox[] = []
  protected hoveredHit: HitBox | null = null
  protected pressedHit: HitBox | null = null

  constructor(opts: CardOpts = {}) {
    const bgColor = opts.bgColor === null ? null : opts.bgColor ?? DEFAULT_BG
    const borderColor = opts.borderColor === null ? null : opts.borderColor ?? DEFAULT_BORDER
    this.#borderWidthPx = opts.borderWidthPx ?? 1

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

    this.#layer = new Object3D()
    this.#layer.name = `${this.constructor.name}.layer`
    this.#layer.position.z = 0
    this.node.add(this.#layer)
  }

  attachCanvas(canvas: UiCanvas): void {
    this.canvas = canvas
  }

  setRect(rect: CardRect, pixelScale: number, font: TrueTypeFont): void {
    this.font = font
    this.pixelScale = pixelScale
    this.rectW = Math.max(1, rect.w)
    this.rectH = Math.max(1, rect.h)
    this.#syncChrome()
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
    const text = new Text(fitted, this.font, opts.fontPx * this.pixelScale, opts.material)
    text.position.x = x * this.pixelScale
    // y — top-of-cap. Baseline ≈ y + fontPx (Text grows up from baseline).
    text.position.y = -(y + opts.fontPx) * this.pixelScale
    text.position.z = opts.z ?? Z.TEXT
    text.updateMatrix()
    this.#layer.add(text)
    return this.measureText(fitted, opts.fontPx)
  }

  /**
   * Рисует прямоугольник в pixel-coords. Клампится к card-bounds.
   */
  drawRect(x: number, y: number, w: number, h: number, color: Color, z = Z.CONTAINER): void {
    const x0 = Math.max(0, x)
    const y0 = Math.max(0, y)
    const x1 = Math.min(this.rectW, x + w)
    const y1 = Math.min(this.rectH, y + h)
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

  /** Точное измерение ширины текста через font advance + letter-spacing. */
  measureText(value: string, fontPx: number): number {
    if (this.font === null) return 0
    const f = this.font
    const scale = fontPx / f.unitsPerEm
    const letterSpacing = fontPx * 0.05
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
    const hit = this.#hitAt(localX, localY)
    this.canvas.canvas.style.cursor = hit?.cursor ?? "default"
    if (hit === this.hoveredHit) return
    this.hoveredHit = hit
  }

  onPointerDown(_event: MouseEvent, localX: number, localY: number): void {
    const hit = this.#hitAt(localX, localY)
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
  }

  // ────────────────────────── Internal ──────────────────────────

  #syncChrome(): void {
    const ps = this.pixelScale
    const w = this.rectW
    const h = this.rectH

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
    this.#clearLayer()
    this.#hits = []
    this.render()
  }

  #hitAt(x: number, y: number): HitBox | null {
    for (let i = this.#hits.length - 1; i >= 0; i--) {
      const h = this.#hits[i]!
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h
    }
    return null
  }

  #clearLayer(): void {
    const renderer = this.canvas?.renderer
    for (const obj of this.#layer.children) {
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
    this.#layer.children = []
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
}

function mkMesh(name: string, mat: MeshBasicMaterial): Mesh {
  const m = new Mesh(new PlaneGeometry({width: 1, height: 1}), mat)
  m.name = name
  return m
}
