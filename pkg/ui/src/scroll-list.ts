/**
 * Scrollable list — переиспользуемая wheel/scroll/render machinery.
 *
 * Использование:
 *
 *   class FramesCard extends Card {
 *     #list = new ScrollListState({onChange: () => this.requestRender()})
 *     onWheel(e) { this.#list.applyWheel(e, ROW_H, total, visible) }
 *     render() {
 *       scrollList(this, {state: this.#list, items: this.#frames, rowH: ROW_H,
 *         x: 0, y: listTop, w: this.rectW, h: listH,
 *         drawRow: (frame, i, x, y, w, h) => this.#drawFrame(frame, x, y, w)})
 *     }
 *   }
 *
 * Fractional scroll:
 *  • state.scroll — float в row-units. Render берёт floor(scroll) для
 *    индексации + sub-row offset для плавного отображения.
 *  • Каждый wheel-event применяется синхронно — никаких setTimeout/RAF.
 *    macOS trackpad сам генерирует momentum-tail (последовательные wheel-
 *    events с убывающим deltaY), поверх него custom inertia давала рывки
 *    и стартовала с задержкой → ощущение «тупняка». Стандартный wheel
 *    behaviour без надстроек = отзывчиво и плавно из коробки.
 */

import type {Color} from "@metafor/engine"
import {Z, type Card} from "./card.ts"
import {scrollbar, type ScrollbarOpts} from "./widgets.ts"

export type ScrollListStateOpts = {
  /** Вызывается когда scroll реально изменился — Card должна позвать requestRender. */
  onChange?: () => void
}

export class ScrollListState {
  /** Текущая позиция (float, в row-units). Render использует floor(scroll) + subPx. */
  scroll = 0
  /** Оставлен для совместимости — больше не используется (deadzone убран). */
  scrollAccum = 0
  #onChange: () => void

  constructor(opts: ScrollListStateOpts = {}) {
    this.#onChange = opts.onChange ?? noop
  }

  /** Привязать onChange callback после конструктора. */
  attachOnChange(cb: () => void): void {
    this.#onChange = cb
  }

  /** Сброс позиции — например после смены items. */
  reset(): void {
    this.scroll = 0
  }

  /** Мгновенный jump (без onChange — caller сам решает рендерить). */
  jumpTo(value: number): void {
    this.scroll = normalizeScroll(value)
  }

  /** Установить позицию + onChange. Используется для programmatic update (Arrow/PageDown/...). */
  scrollTo(value: number): void {
    const next = normalizeScroll(value)
    if (next === this.scroll) return
    this.scroll = next
    this.#onChange()
  }

  /**
   * Применить wheel-event синхронно. Возвращает true если scroll изменился.
   * Никаких deadzone, аккумуляторов, RAF — просто delta → scroll → onChange.
   */
  applyWheel(event: WheelEvent, rowH: number, total: number, visible: number): boolean {
    const max = Math.max(0, total - visible)
    const safeRowH = Math.max(1, rowH)
    let rowsDelta: number
    if (event.deltaMode === 1) rowsDelta = event.deltaY
    else if (event.deltaMode === 2) rowsDelta = event.deltaY * visible
    else rowsDelta = event.deltaY / safeRowH
    if (rowsDelta === 0 || !Number.isFinite(rowsDelta)) return false

    const next = clampScroll(this.scroll + rowsDelta, max)
    if (next === this.scroll) return false
    this.scroll = next
    this.#onChange()
    return true
  }

  /**
   * Скорректировать scroll к bounds после изменения total/visible.
   * Не вызывает onChange — рендер уже идёт.
   */
  clamp(total: number, visible: number): void {
    const max = Math.max(0, total - visible)
    if (this.scroll > max) this.scroll = max
    if (this.scroll < 0) this.scroll = 0
    this.scroll = normalizeScroll(this.scroll)
  }
}

function noop(): void {
  /* no-op */
}

function normalizeScroll(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

function clampScroll(value: number, max: number): number {
  return Math.max(0, Math.min(max, normalizeScroll(value)))
}

export type EdgeFadeOpts = {
  color: Color
  /** Высота fade-зоны у каждого края. Default 18px. */
  sizePx?: number
  /** Количество полос для псевдо-градиента. Default 8. */
  steps?: number
  /** Максимальная плотность overlay у самого края. Default 0.86. */
  maxAlpha?: number
  top?: boolean
  bottom?: boolean
  z?: number
}

export type ScrollListOpts<T> = {
  state: ScrollListState
  items: ArrayLike<T>
  /** Высота одной row в logical px. */
  rowH: number
  /** Gap между rows. Default 0. */
  rowGap?: number
  /** Bounds списка в card-px. */
  x: number
  y: number
  w: number
  h: number
  /** Ширина gutter'а под scrollbar справа от items. Default 4. */
  scrollbarWidth?: number
  /** Расстояние между правым краем items и scrollbar'ом. Default 6. */
  scrollbarGap?: number
  /** Скрывать scrollbar если items <= visible. Default true. */
  hideScrollbarWhenFits?: boolean
  /** Опции для scrollbar widget'а (minThumbHeight). */
  scrollbarOpts?: Pick<ScrollbarOpts, "minThumbHeight">
  /** Мягко растворяет частично видимые строки сверху/снизу. */
  edgeFade?: EdgeFadeOpts
  /** Draw-callback для одной row. Координаты — card-px. */
  drawRow(item: T, idx: number, x: number, y: number, w: number, h: number): void
}

export type ScrollListMetrics = {
  /** Сколько rows влезает в height. */
  visible: number
  /** Текущий scroll (после clamp'а). */
  scroll: number
}

/**
 * Рисует видимые rows + scrollbar. state.scroll — float, sub-row offset
 * рисуется для плавности при дробных значениях.
 */
export function scrollList<T>(card: Card, opts: ScrollListOpts<T>): ScrollListMetrics {
  const rowGap = opts.rowGap ?? 0
  const rowStride = opts.rowH + rowGap
  const sbW = opts.scrollbarWidth ?? 4
  const sbGap = opts.scrollbarGap ?? 6
  const total = opts.items.length
  const visible = Math.max(1, Math.floor((opts.h + rowGap) / rowStride))
  opts.state.clamp(total, visible)

  const showScrollbar = total > visible || opts.hideScrollbarWhenFits === false
  const itemsW = showScrollbar ? Math.max(1, opts.w - sbW - sbGap) : opts.w

  const startIdx = Math.floor(opts.state.scroll)
  const subPx = (opts.state.scroll - startIdx) * rowStride
  const renderCount = visible + 2

  // Pixel-precise clip по списку: text.wgsl discardит фрагменты за этим
  // rect'ом. Граничные строки (с sub-px смещением) обрезаются ровно по краю.
  card.pushClip(opts.x, opts.y, itemsW, opts.h)
  try {
    for (let i = 0; i < renderCount; i++) {
      const idx = startIdx + i
      if (idx >= total) break
      const item = (opts.items as {[index: number]: T})[idx]
      if (item === undefined) continue
      const rowY = opts.y + i * rowStride - subPx
      if (rowY + opts.rowH < opts.y - 1) continue
      if (rowY > opts.y + opts.h + 1) break
      opts.drawRow(item, idx, opts.x, rowY, itemsW, opts.rowH)
    }
  } finally {
    card.popClip()
  }

  if (opts.edgeFade !== undefined) {
    edgeFade(card, {
      ...opts.edgeFade,
      x: opts.x,
      y: opts.y,
      w: itemsW,
      h: opts.h,
    })
  }

  if (showScrollbar) {
    scrollbar(card, opts.x + opts.w - sbW, opts.y, opts.h, {
      offset: opts.state.scroll,
      visible,
      total: Math.max(total, visible),
      trackWidth: sbW,
      ...(opts.scrollbarOpts ?? {}),
    })
  }

  return {visible, scroll: opts.state.scroll}
}

export function edgeFade(card: Card, opts: EdgeFadeOpts & {
  x: number
  y: number
  w: number
  h: number
}): void {
  const size = Math.max(0, Math.min(opts.sizePx ?? 18, opts.h / 2))
  if (size <= 0 || opts.w <= 0 || opts.h <= 0) return

  const steps = Math.max(1, Math.floor(opts.steps ?? 8))
  const stepH = size / steps
  const z = opts.z ?? Z.TEXT + 0.00003
  const maxAlpha = opts.maxAlpha ?? 0.86
  const drawBand = (y: number, alpha: number): void => {
    const color = opts.color.clone()
    color.a = Math.max(0, Math.min(1, alpha))
    card.drawRect(opts.x, y, opts.w, stepH + 0.75, color, z)
  }

  if (opts.top !== false) {
    for (let i = 0; i < steps; i++) {
      const t = 1 - i / steps
      drawBand(opts.y + i * stepH, maxAlpha * t * t)
    }
  }

  if (opts.bottom !== false) {
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps
      drawBand(opts.y + opts.h - size + i * stepH, maxAlpha * t * t)
    }
  }
}

/**
 * @deprecated Использовать state.applyWheel(...). Оставлен для совместимости.
 */
export function wheelScrollStep(
  state: ScrollListState,
  event: WheelEvent,
  rowH: number,
  total: number,
  visible: number,
): boolean {
  return state.applyWheel(event, rowH, total, visible)
}
