/**
 * Card UI system — единая база для всех debug-карточек.
 *
 * Контракт:
 *  • Card имеет фиксированный outer rect (rectW × rectH в logical px),
 *    задаётся XrCanvas через setRect. Внутри карточки рисуем в pixel-coords
 *    относительно её TL (top-left).
 *  • Background mesh всегда привязан к (0,0)..(rectW,rectH) — НЕ ВЫЛАЗИТ.
 *    Card сам владеет этим mesh; subclass не трогает.
 *  • Border (опционально) — 4 mesh-полоски по периметру; тоже Card-owned.
 *  • Все primitives (drawText/drawRect/hit/button/badge) принимают пиксельные
 *    координаты от card-TL и НЕ ВЫЛАЗЯТ автоматически: drawRect клампится
 *    к card-bounds, drawText обрезается через измерение font.getHMetric'ом
 *    (точное), не estimate.
 *  • Mesh.parent ВСЕГДА выставляется через Object3D.add() — никаких unshift.
 *  • Между renderами #layer полностью пересобирается; геометрия старых
 *    Text/Mesh инвалидируется в renderer'е.
 *  • Hit-test работает в pixel-coords карточки. Subclass добавляет hits через
 *    this.hit(...). На pointer-events Card сам ищет попадание и зовёт action.
 *
 * Жизненный цикл:
 *  1. constructor — создаются bg/border meshes, layer-Object3D.
 *  2. attachCanvas — XrCanvas передаёт себя.
 *  3. setRect — изменились size/pixelScale → syncChrome (bg/border) + rerender.
 *  4. requestRender (subclass) — данные изменились без resize → rerender.
 *  5. dispose — очистка.
 *
 * Subclass обязан реализовать только render(): void.
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
} from "@metafor/engine"
import type {CardRect, XrCanvas, XrCard} from "./xr-canvas.ts"

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
  /** Если задан — текст обрезается через измерение и "...". */
  maxWidthPx?: number
  /** Z в локальной системе layer'а. Default Z.TEXT (= 0.05). */
  z?: number
}

/**
 * Z-стек слоёв (в layer-frame, прибавляется layer.position.z = 0.001).
 * Используйте эти константы вместо magic-numbers.
 *
 *   CARD_BG       -0.02   // Card-managed, рисуется ВНЕ #layer
 *   CARD_BORDER   -0.01   // Card-managed
 *   CONTAINER      0.00   // panel/row backdrop внутри карточки
 *   SEPARATOR      0.01   // divider, side-stripe — поверх container'а
 *   ELEMENT        0.02   // button/badge/input bg — поверх container'а
 *   ELEMENT_RULE   0.03   // border button/badge — поверх element-bg
 *   TEXT           0.05   // лейблы — над всем
 */
export const Z = {
  CONTAINER: 0,
  SEPARATOR: 0.01,
  ELEMENT: 0.02,
  ELEMENT_RULE: 0.03,
  TEXT: 0.05,
} as const

export type FlexAlign = "start" | "center" | "end" | "stretch"
export type FlexJustify = "start" | "center" | "end" | "space-between" | "space-around"

export type FlexItem = {
  /** Фиксированная ширина в logical px, или "grow" — займёт остаток. */
  width: number | "grow"
  /** Фиксированная высота элемента (используется для alignItems). */
  height: number
  /** Override-выравнивание по cross-axis. */
  alignSelf?: FlexAlign
  /** draw(x, y, width, height) — координаты слота в card-px. */
  draw(x: number, y: number, width: number, height: number): void
}

export type FlexColumnItem = {
  height: number | "grow"
  /** Опциональная фикс-ширина при alignItems != stretch. */
  width?: number
  alignSelf?: FlexAlign
  draw(x: number, y: number, width: number, height: number): void
}

type FlexBoxBase = {
  x: number
  y: number
  w: number
  h: number
  paddingX?: number
  paddingY?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  gap?: number
  alignItems?: FlexAlign
  justifyContent?: FlexJustify
}

export type FlexRowOpts = FlexBoxBase & {items: Array<FlexItem | null | undefined>}
export type FlexColumnOpts = FlexBoxBase & {items: Array<FlexColumnItem | null | undefined>}

const DEFAULT_BG = new Color(18 / 255, 23 / 255, 32 / 255, 0.96)
const DEFAULT_BORDER = new Color(62 / 255, 74 / 255, 92 / 255, 1)

export abstract class Card implements XrCard {
  readonly node = new Object3D()
  protected canvas: XrCanvas | null = null
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
      this.#bg.position.z = -0.02
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
        m.position.z = -0.01
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
    this.#layer.position.z = 0.001
    this.node.add(this.#layer)
  }

  attachCanvas(canvas: XrCanvas): void {
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

  /** Subclass зовёт когда данные изменились — re-render без resize. */
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
   * font-метрик. Текст НИКОГДА не выйдет за границу.
   * Возвращает фактическую ширину в logical px.
   */
  protected drawText(value: string, x: number, y: number, opts: DrawTextOpts): number {
    if (this.font === null) return 0
    const maxPx = opts.maxWidthPx ?? Infinity
    if (maxPx <= 0) return 0
    const fitted = this.#fitText(value, maxPx, opts.fontPx)
    if (fitted.length === 0) return 0
    const text = new Text(fitted, this.font, opts.fontPx * this.pixelScale, opts.material)
    text.position.x = x * this.pixelScale
    // Text.position.y — где сидит baseline. y у нас — top-of-cap.
    // Baseline ≈ y + fontPx*0.85 от TL карточки, но Text-glyph рисуется
    // от baseline вверх, поэтому ставим baseline в y + fontPx (визуально
    // top будет ≈ y + 0.15*fontPx, descender ≈ y + 1.05*fontPx).
    text.position.y = -(y + opts.fontPx) * this.pixelScale
    text.position.z = opts.z ?? Z.TEXT
    text.updateMatrix()
    this.#layer.add(text)
    return this.measureText(fitted, opts.fontPx)
  }

  /**
   * Рисует прямоугольник в pixel-coords. Клампится к bounds карточки —
   * не вылазит. z по умолчанию 0 (между bg и текстом).
   */
  protected drawRect(x: number, y: number, w: number, h: number, color: Color, z = 0): void {
    // Clamp to card bounds.
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

  /** Точное измерение ширины текста через font advance + letter-spacing (как в Text.ts). */
  protected measureText(value: string, fontPx: number): number {
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

  /** Регистрирует hit-rect в card-px coords. Поверх предыдущих побеждают позже добавленные. */
  protected hit(x: number, y: number, w: number, h: number, action: () => void, cursor = "pointer"): void {
    this.#hits.push({x, y, w, h, action, cursor})
  }

  // ────────────────────────── Flex layout ──────────────────────────
  // Простой flex-калькулятор: получает rect + опции + items, считает
  // позицию каждого item'а и вызывает его draw(x, y, w, h). Никаких
  // Yoga-узлов и tree-build'ов — работаем плоско, всё за один проход.

  /**
   * Горизонтальный flex-row. items с фиксированной шириной или "grow"
   * (займут оставшееся место поровну). Поддерживается justifyContent
   * (для items без grow), alignItems (вертикальный align), gap, padding.
   */
  protected flexRow(opts: FlexRowOpts): void {
    const padL = opts.paddingLeft ?? opts.paddingX ?? 0
    const padR = opts.paddingRight ?? opts.paddingX ?? 0
    const padT = opts.paddingTop ?? opts.paddingY ?? 0
    const padB = opts.paddingBottom ?? opts.paddingY ?? 0
    const gap = opts.gap ?? 0
    const innerX = opts.x + padL
    const innerY = opts.y + padT
    const innerW = Math.max(0, opts.w - padL - padR)
    const innerH = Math.max(0, opts.h - padT - padB)
    const items = opts.items.filter((i): i is FlexItem => i !== null && i !== undefined)
    if (items.length === 0) return

    const totalGap = gap * (items.length - 1)
    const fixedSum = items.reduce((s, i) => s + (i.width === "grow" ? 0 : i.width), 0)
    const growCount = items.filter((i) => i.width === "grow").length
    const remaining = innerW - fixedSum - totalGap
    const growSize = growCount > 0 ? Math.max(0, remaining / growCount) : 0

    let startX = innerX
    let extraGap = 0
    if (growCount === 0) {
      const slack = remaining
      if (opts.justifyContent === "center") startX += slack / 2
      else if (opts.justifyContent === "end") startX += slack
      else if (opts.justifyContent === "space-between" && items.length > 1) extraGap = slack / (items.length - 1)
      else if (opts.justifyContent === "space-around" && items.length > 0) {
        startX += slack / (items.length * 2)
        extraGap = slack / items.length
      }
    }

    let cursor = startX
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      const w = item.width === "grow" ? growSize : item.width
      let y = innerY
      const align = item.alignSelf ?? opts.alignItems ?? "start"
      if (align === "center") y += (innerH - item.height) / 2
      else if (align === "end") y += innerH - item.height
      item.draw(cursor, y, w, item.height)
      cursor += w + gap + extraGap
    }
  }

  /**
   * Вертикальный flex-column. items с фиксированной высотой или "grow".
   */
  protected flexColumn(opts: FlexColumnOpts): void {
    const padL = opts.paddingLeft ?? opts.paddingX ?? 0
    const padR = opts.paddingRight ?? opts.paddingX ?? 0
    const padT = opts.paddingTop ?? opts.paddingY ?? 0
    const padB = opts.paddingBottom ?? opts.paddingY ?? 0
    const gap = opts.gap ?? 0
    const innerX = opts.x + padL
    const innerY = opts.y + padT
    const innerW = Math.max(0, opts.w - padL - padR)
    const innerH = Math.max(0, opts.h - padT - padB)
    const items = opts.items.filter((i): i is FlexColumnItem => i !== null && i !== undefined)
    if (items.length === 0) return

    const totalGap = gap * (items.length - 1)
    const fixedSum = items.reduce((s, i) => s + (i.height === "grow" ? 0 : i.height), 0)
    const growCount = items.filter((i) => i.height === "grow").length
    const remaining = innerH - fixedSum - totalGap
    const growSize = growCount > 0 ? Math.max(0, remaining / growCount) : 0

    let startY = innerY
    let extraGap = 0
    if (growCount === 0) {
      const slack = remaining
      if (opts.justifyContent === "center") startY += slack / 2
      else if (opts.justifyContent === "end") startY += slack
      else if (opts.justifyContent === "space-between" && items.length > 1) extraGap = slack / (items.length - 1)
      else if (opts.justifyContent === "space-around" && items.length > 0) {
        startY += slack / (items.length * 2)
        extraGap = slack / items.length
      }
    }

    let cursor = startY
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      const h = item.height === "grow" ? growSize : item.height
      let x = innerX
      const align = item.alignSelf ?? opts.alignItems ?? "stretch"
      let w = innerW
      if (align !== "stretch" && item.width !== undefined) {
        w = Math.min(innerW, item.width)
        if (align === "center") x += (innerW - w) / 2
        else if (align === "end") x += innerW - w
      }
      item.draw(x, cursor, w, h)
      cursor += h + gap + extraGap
    }
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
      this.#bg.geometry = new PlaneGeometry({width: w * ps, height: h * ps})
      this.#bg.position.x = (w / 2) * ps
      this.#bg.position.y = -(h / 2) * ps
      this.#bg.updateMatrix()
    }

    if (this.#borderTop !== null) {
      const bw = this.#borderWidthPx
      const bwWorld = bw * ps
      const wWorld = w * ps
      const hWorld = h * ps
      this.#borderTop.geometry = new PlaneGeometry({width: wWorld, height: bwWorld})
      this.#borderTop.position.x = wWorld / 2
      this.#borderTop.position.y = -bwWorld / 2
      this.#borderTop.updateMatrix()
      this.#borderBottom!.geometry = new PlaneGeometry({width: wWorld, height: bwWorld})
      this.#borderBottom!.position.x = wWorld / 2
      this.#borderBottom!.position.y = -hWorld + bwWorld / 2
      this.#borderBottom!.updateMatrix()
      this.#borderLeft!.geometry = new PlaneGeometry({width: bwWorld, height: hWorld})
      this.#borderLeft!.position.x = bwWorld / 2
      this.#borderLeft!.position.y = -hWorld / 2
      this.#borderLeft!.updateMatrix()
      this.#borderRight!.geometry = new PlaneGeometry({width: bwWorld, height: hWorld})
      this.#borderRight!.position.x = wWorld - bwWorld / 2
      this.#borderRight!.position.y = -hWorld / 2
      this.#borderRight!.updateMatrix()
    }
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
    // Бинарный поиск максимального префикса так что (prefix + "...") <= maxPx.
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
