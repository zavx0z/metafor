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
 * Sub-pixel scroll БЕЗ animation-loop'а:
 *  • state.scroll — float (rows). Render берёт floor(scroll) для индексации
 *    + sub-row offset для плавного отображения.
 *  • applyWheel меняет scroll ровно на event.deltaY/rowH (с pixel-accumulator
 *    для тачпадных < 0.5px deltaY) и зовёт onChange ОДИН раз. Никаких RAF.
 *  • Trackpad fling уже даёт ~10 wheel-events с убывающей deltaY (inertia
 *    инжектится самой macOS), поэтому видимая инерция получается естественно.
 */

import {scrollbar, type ScrollbarOpts} from "./widgets.ts"
import type {Card} from "./card.ts"

export type ScrollListStateOpts = {
  /** Вызывается когда scroll реально изменился — Card должна позвать requestRender. */
  onChange?: () => void
}

export class ScrollListState {
  /** Текущая позиция (float, в row-units). Render использует floor(scroll) + subPx. */
  scroll = 0
  /** Аккумулятор для wheel pixel-mode (subpixel-deltaY, чтобы не терялись). */
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
    this.scrollAccum = 0
  }

  /** Мгновенный jump (без анимации, без onChange — caller сам решает рендерить). */
  jumpTo(value: number): void {
    this.scroll = value
    this.scrollAccum = 0
  }

  /** Установить позицию + onChange. Используется для programmatic update (Arrow/PageDown/...). */
  scrollTo(value: number): void {
    if (value === this.scroll) return
    this.scroll = value
    this.scrollAccum = 0
    this.#onChange()
  }

  /**
   * Применить wheel-event. Обновляет scroll, зовёт onChange ровно один раз
   * (если scroll действительно изменился). Возвращает true в этом случае.
   */
  applyWheel(event: WheelEvent, rowH: number, total: number, visible: number): boolean {
    const max = Math.max(0, total - visible)
    let rowsDelta: number
    if (event.deltaMode === 1) {
      rowsDelta = event.deltaY
      this.scrollAccum = 0
    } else if (event.deltaMode === 2) {
      rowsDelta = event.deltaY * visible
      this.scrollAccum = 0
    } else {
      // pixel-mode. Накапливаем сабпиксельные deltaY чтобы не терялся вход
      // мелкой прокрутки тачпада. Threshold 0.5px — ниже него считаем noise.
      const px = this.scrollAccum + event.deltaY
      if (Math.abs(px) < 0.5) {
        this.scrollAccum = px
        return false
      }
      rowsDelta = px / rowH
      this.scrollAccum = 0
    }
    const next = Math.max(0, Math.min(max, this.scroll + rowsDelta))
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
  }
}

function noop(): void {
  /* no-op */
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
 * рисуется для плавности при дробных значениях (тачпад fling). +1 row
 * сверху-снизу для smooth boundary, partial rows клампятся drawRect'ом
 * Card-системы.
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
  const renderCount = visible + 1

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
