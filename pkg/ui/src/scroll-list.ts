/**
 * Scrollable list — переиспользуемая wheel/scroll/render machinery.
 *
 * Subclass'у не нужно держать своё #scroll/#scrollAccum + wheel-accumulator +
 * draw visible rows + scrollbar — всё это здесь. Использование:
 *
 *   class FramesCard extends Card {
 *     #list = new ScrollListState()
 *     onWheel(e) { if (wheelScrollStep(this.#list, e, ROW_H, total, visible)) this.requestRender() }
 *     render() {
 *       scrollList(this, {state: this.#list, items: this.#frames, rowH: ROW_H,
 *         x: 0, y: listTop, w: this.rectW, h: listH,
 *         drawRow: (frame, i, x, y, w, h) => this.#drawFrame(frame, x, y, w)})
 *     }
 *   }
 *
 * scrollList сам считает visible, clamp'ит scroll, рисует видимые rows
 * через drawRow-callback и draws scrollbar справа (если total > visible).
 */

import {scrollbar, type ScrollbarOpts} from "./widgets.ts"
import type {Card} from "./card.ts"

export class ScrollListState {
  scroll = 0
  scrollAccum = 0

  /** Сброс позиции (например после смены items). */
  reset(): void {
    this.scroll = 0
    this.scrollAccum = 0
  }
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
  /** Сколько rows влезает в height (без gap'а в самом последнем slot'е). */
  visible: number
  /** Сколько items пропущено сверху. После clamp'а гарантированно ∈ [0, total - visible]. */
  scroll: number
}

/**
 * Рисует видимые rows через drawRow + scrollbar справа. Возвращает
 * актуальные visible/scroll (после clamp'а), чтобы caller мог использовать
 * их (например для onSelect hit-test'ов).
 */
export function scrollList<T>(card: Card, opts: ScrollListOpts<T>): ScrollListMetrics {
  const rowGap = opts.rowGap ?? 0
  const sbW = opts.scrollbarWidth ?? 4
  const sbGap = opts.scrollbarGap ?? 6
  const total = opts.items.length
  const visible = Math.max(1, Math.floor((opts.h + rowGap) / (opts.rowH + rowGap)))
  const max = Math.max(0, total - visible)
  if (opts.state.scroll > max) opts.state.scroll = max
  if (opts.state.scroll < 0) opts.state.scroll = 0

  const showScrollbar = total > visible || opts.hideScrollbarWhenFits === false
  const itemsW = showScrollbar ? Math.max(1, opts.w - sbW - sbGap) : opts.w

  for (let i = 0; i < visible; i++) {
    const idx = opts.state.scroll + i
    if (idx >= total) break
    const item = (opts.items as {[index: number]: T})[idx]
    if (item === undefined) continue
    const rowY = opts.y + i * (opts.rowH + rowGap)
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
 * Применяет wheel-event к ScrollListState. Накапливает дробную часть
 * deltaY в pixel-mode и отщипывает целые row-step'ы. line-mode (deltaMode=1)
 * и page-mode (deltaMode=2) обрабатываются как fixed step'ы.
 *
 * Возвращает true если scroll изменился — caller вызывает requestRender.
 */
export function wheelScrollStep(
  state: ScrollListState,
  event: WheelEvent,
  rowH: number,
  total: number,
  visible: number,
): boolean {
  const max = Math.max(0, total - visible)
  const linesDelta = event.deltaMode === 1
    ? event.deltaY
    : event.deltaMode === 2
      ? event.deltaY * visible
      : (state.scrollAccum + event.deltaY) / rowH
  const stepLines = Math.trunc(linesDelta)
  if (event.deltaMode === 0) {
    state.scrollAccum = (state.scrollAccum + event.deltaY) - stepLines * rowH
  } else {
    state.scrollAccum = 0
  }
  if (stepLines === 0) return false
  const next = Math.max(0, Math.min(max, state.scroll + stepLines))
  if (next === state.scroll) return false
  state.scroll = next
  return true
}
