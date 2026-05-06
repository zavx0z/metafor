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
 * Smooth scrolling:
 *  • state.scroll — float (rows). Render берёт Math.round(scroll) для индексации.
 *  • state.target — куда мы хотим оказаться. wheel обновляет target.
 *  • RAF-loop лerp'ит scroll → target с factor 0.22 на кадр (≈3 кадра до цели).
 *  • Когда |target - scroll| < 0.01 — snap, остановка анимации.
 *  • Trackpad fling → каждый из ~10 wheel-events накапливает target → плавное
 *    "затухание" rather than discrete jumps.
 */

import {scrollbar, type ScrollbarOpts} from "./widgets.ts"
import type {Card} from "./card.ts"

const LERP_FACTOR = 0.22
const SNAP_EPSILON = 0.01

export type ScrollListStateOpts = {
  /** Вызывается на каждом animation-tick'е. Card должна позвать requestRender. */
  onChange?: () => void
}

export class ScrollListState {
  /** Текущая позиция (float, в row-units). Render использует Math.round(scroll). */
  scroll = 0
  /** Куда стремится scroll. Wheel обновляет target. */
  target = 0
  /** Аккумулятор для wheel pixel-mode (subpixel-deltaY). */
  scrollAccum = 0
  #onChange: () => void
  #raf: number | null = null

  constructor(opts: ScrollListStateOpts = {}) {
    this.#onChange = opts.onChange ?? noop
  }

  /** Привязать onChange callback после конструктора. */
  attachOnChange(cb: () => void): void {
    this.#onChange = cb
  }

  /** Сброс позиции — например после смены items. Останавливает анимацию. */
  reset(): void {
    if (this.#raf !== null) cancelAnimationFrame(this.#raf)
    this.#raf = null
    this.scroll = 0
    this.target = 0
    this.scrollAccum = 0
  }

  /** Мгновенный jump (skip анимации). */
  jumpTo(value: number): void {
    if (this.#raf !== null) cancelAnimationFrame(this.#raf)
    this.#raf = null
    this.scroll = value
    this.target = value
    this.scrollAccum = 0
  }

  /** Анимированный переход на новый target (lerp). */
  scrollTo(value: number): void {
    if (value === this.target) return
    this.target = value
    this.#startAnim()
  }

  /**
   * Применить wheel-event. Обновляет target, запускает анимацию.
   * Возвращает true если target изменился.
   */
  applyWheel(event: WheelEvent, rowH: number, total: number, visible: number): boolean {
    const max = Math.max(0, total - visible)
    // Сводим все 3 deltaMode к row-units. pixel-mode использует accumulator
    // чтобы тачпадные субпиксельные deltaY не терялись.
    let rowsDelta: number
    if (event.deltaMode === 1) {
      rowsDelta = event.deltaY
      this.scrollAccum = 0
    } else if (event.deltaMode === 2) {
      rowsDelta = event.deltaY * visible
      this.scrollAccum = 0
    } else {
      const px = this.scrollAccum + event.deltaY
      // pixel: разрешаем sub-row deltas (никакого Math.trunc), накапливаем хвост.
      // Пороговый шаг 0.5px — отбрасываем ниже него чтобы случайный noise не дрожал target.
      if (Math.abs(px) < 0.5) {
        this.scrollAccum = px
        return false
      }
      rowsDelta = px / rowH
      this.scrollAccum = 0
    }
    const next = Math.max(0, Math.min(max, this.target + rowsDelta))
    if (next === this.target) return false
    this.target = next
    this.#startAnim()
    return true
  }

  /**
   * Скорректировать target/scroll к bounds после изменения total/visible.
   * Не запускает анимацию — просто clamp.
   */
  clamp(total: number, visible: number): void {
    const max = Math.max(0, total - visible)
    if (this.target > max) this.target = max
    if (this.target < 0) this.target = 0
    if (this.scroll > max) this.scroll = max
    if (this.scroll < 0) this.scroll = 0
  }

  #startAnim(): void {
    if (this.#raf !== null) return
    this.#raf = requestAnimationFrame(() => this.#tick())
  }

  #tick(): void {
    this.#raf = null
    const diff = this.target - this.scroll
    if (Math.abs(diff) < SNAP_EPSILON) {
      this.scroll = this.target
      this.#onChange()
      return
    }
    this.scroll += diff * LERP_FACTOR
    this.#onChange()
    this.#raf = requestAnimationFrame(() => this.#tick())
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
  /** Сколько rows влезает в height (без gap'а в самом последнем slot'е). */
  visible: number
  /** Сколько items пропущено сверху. После clamp'а гарантированно ∈ [0, total - visible]. */
  scroll: number
}

/**
 * Рисует видимые rows через drawRow + scrollbar справа. state.scroll —
 * float, рисуем с sub-row offset'ом для smooth animation; нижняя/верхняя
 * partial row рисуется чуть за границей — Card.drawRect клампит, drawText
 * НЕ клампит по y, поэтому caller должен учесть что text вне frame будет
 * виден (если headerY совсем близко).
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

  // Sub-row offset для плавной анимации между integer-positions.
  const startIdx = Math.floor(opts.state.scroll)
  const subPx = (opts.state.scroll - startIdx) * rowStride
  // +1 row сверху-снизу — partial rows на границах.
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
 * @deprecated Использовать state.applyWheel(...) — встроенный smooth + inertia.
 * Эта функция оставлена для обратной совместимости (без анимации, integer scroll).
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
