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
 *  • pixel-mode wheel применяется сразу, без deadzone: даже маленький deltaY
 *    двигает список и зовёт onChange.
 *  • Если браузер не отдаёт красивый momentum-tail сам, state добавляет
 *    короткую kinetic-инерцию после последнего wheel event.
 */

import type {Color} from "@metafor/engine"
import {Z, type Card} from "./card.ts"
import {scrollbar, type ScrollbarOpts} from "./widgets.ts"

export type ScrollListStateOpts = {
  /** Вызывается когда scroll реально изменился — Card должна позвать requestRender. */
  onChange?: () => void
  /** Короткий kinetic-tail после wheel. Default true в browser runtime. */
  inertia?: boolean
}

export class ScrollListState {
  /** Текущая позиция (float, в row-units). Render использует floor(scroll) + subPx. */
  scroll = 0
  /** Оставлен для совместимости/debug visibility. Малые deltaY теперь не задерживаются. */
  scrollAccum = 0
  #onChange: () => void
  readonly #inertiaEnabled: boolean
  #maxScroll = 0
  #lastWheelMs = 0
  #lastInertiaMs = 0
  #velocityRowsPerMs = 0
  #inertiaTimer: ReturnType<typeof setTimeout> | undefined
  #inertiaRaf: number | undefined
  readonly #runInertia = (timestamp: number): void => {
    this.#inertiaRaf = undefined
    if (!this.#canAnimate() || Math.abs(this.#velocityRowsPerMs) < MIN_INERTIA_VELOCITY) {
      this.#velocityRowsPerMs = 0
      return
    }

    const dt = this.#lastInertiaMs === 0 ? 16 : Math.max(1, Math.min(32, timestamp - this.#lastInertiaMs))
    this.#lastInertiaMs = timestamp
    const next = clampScroll(this.scroll + this.#velocityRowsPerMs * dt, this.#maxScroll)
    if (next === this.scroll) {
      this.#velocityRowsPerMs = 0
      return
    }

    this.scroll = next
    this.#onChange()
    this.#velocityRowsPerMs *= Math.exp(-dt / INERTIA_DECAY_MS)
    this.#inertiaRaf = requestAnimationFrame(this.#runInertia)
  }

  constructor(opts: ScrollListStateOpts = {}) {
    this.#onChange = opts.onChange ?? noop
    this.#inertiaEnabled = opts.inertia ?? true
  }

  /** Привязать onChange callback после конструктора. */
  attachOnChange(cb: () => void): void {
    this.#onChange = cb
  }

  /** Сброс позиции — например после смены items. */
  reset(): void {
    this.#stopInertia()
    this.scroll = 0
    this.scrollAccum = 0
  }

  /** Мгновенный jump (без анимации, без onChange — caller сам решает рендерить). */
  jumpTo(value: number): void {
    this.#stopInertia()
    this.scroll = normalizeScroll(value)
    this.scrollAccum = 0
  }

  /** Установить позицию + onChange. Используется для programmatic update (Arrow/PageDown/...). */
  scrollTo(value: number): void {
    this.#stopInertia()
    const next = normalizeScroll(value)
    if (next === this.scroll) return
    this.scroll = next
    this.scrollAccum = 0
    this.#onChange()
  }

  /**
   * Применить wheel-event. Обновляет scroll, зовёт onChange ровно один раз
   * (если scroll действительно изменился). Возвращает true в этом случае.
   */
  applyWheel(event: WheelEvent, rowH: number, total: number, visible: number): boolean {
    const max = Math.max(0, total - visible)
    this.#maxScroll = max
    const safeRowH = Math.max(1, rowH)
    let rowsDelta: number
    if (event.deltaMode === 1) {
      rowsDelta = event.deltaY
      this.scrollAccum = 0
    } else if (event.deltaMode === 2) {
      rowsDelta = event.deltaY * visible
      this.scrollAccum = 0
    } else {
      rowsDelta = event.deltaY / safeRowH
      this.scrollAccum = 0
    }
    if (rowsDelta === 0 || !Number.isFinite(rowsDelta)) return false

    this.#stopInertia()
    const now = nowMs()
    const previous = this.scroll
    const next = clampScroll(this.scroll + rowsDelta, max)
    if (next === this.scroll) {
      this.#captureVelocity(0, now)
      return false
    }
    this.scroll = next
    this.#captureVelocity(next - previous, now)
    this.#onChange()
    this.#scheduleInertia()
    return true
  }

  /**
   * Скорректировать scroll к bounds после изменения total/visible.
   * Не вызывает onChange — рендер уже идёт.
   */
  clamp(total: number, visible: number): void {
    const max = Math.max(0, total - visible)
    this.#maxScroll = max
    if (this.scroll > max) this.scroll = max
    if (this.scroll < 0) this.scroll = 0
    this.scroll = normalizeScroll(this.scroll)
    if (this.scroll === 0 || this.scroll === max) this.#velocityRowsPerMs = 0
  }

  #captureVelocity(deltaRows: number, now: number): void {
    if (deltaRows === 0) {
      this.#velocityRowsPerMs = 0
      this.#lastWheelMs = now
      return
    }
    const dt = this.#lastWheelMs === 0 ? 80 : Math.max(8, Math.min(120, now - this.#lastWheelMs))
    const instant = deltaRows / dt
    const mix = this.#lastWheelMs === 0 ? 1 : 0.35
    this.#velocityRowsPerMs = clampVelocity(this.#velocityRowsPerMs * (1 - mix) + instant * mix)
    this.#lastWheelMs = now
  }

  #scheduleInertia(): void {
    if (!this.#canAnimate()) return
    if (Math.abs(this.#velocityRowsPerMs) < MIN_START_VELOCITY) return
    this.#inertiaTimer = setTimeout(() => {
      this.#inertiaTimer = undefined
      if (!this.#canAnimate()) return
      if (nowMs() - this.#lastWheelMs < INERTIA_START_DELAY_MS - 4) return
      this.#lastInertiaMs = 0
      this.#inertiaRaf = requestAnimationFrame(this.#runInertia)
    }, INERTIA_START_DELAY_MS)
  }

  #stopInertia(): void {
    if (this.#inertiaTimer !== undefined) {
      clearTimeout(this.#inertiaTimer)
      this.#inertiaTimer = undefined
    }
    if (this.#inertiaRaf !== undefined && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.#inertiaRaf)
      this.#inertiaRaf = undefined
    }
    this.#lastInertiaMs = 0
  }

  #canAnimate(): boolean {
    return this.#inertiaEnabled
      && typeof document !== "undefined"
      && typeof requestAnimationFrame === "function"
      && typeof cancelAnimationFrame === "function"
  }
}

const MAX_VELOCITY_ROWS_PER_MS = 0.02
const MIN_START_VELOCITY = 0.0012
const MIN_INERTIA_VELOCITY = 0.00035
const INERTIA_DECAY_MS = 220
const INERTIA_START_DELAY_MS = 72

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

function clampVelocity(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-MAX_VELOCITY_ROWS_PER_MS, Math.min(MAX_VELOCITY_ROWS_PER_MS, value))
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
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
