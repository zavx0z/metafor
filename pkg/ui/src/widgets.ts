/**
 * Widget-функции для использования внутри Card.render(). Принимают
 * Card как первый аргумент и используют его public-primitives drawText/
 * drawRect/measureText/hit.
 *
 * Не классы — карточкам не нужен лишний state. Виджеты — это просто
 * "draw-this-thing-here" утилиты с консистентным look-and-feel.
 */

import {Z, type Card} from "./card.ts"
import {palette, type Tone, toneBorder, toneFill} from "./theme.ts"

export type ButtonOpts = {
  label: string
  tone?: Tone
  fontPx?: number
  action(): void
}

export type BadgeOpts = {
  label: string
  tone?: Tone
  fontPx?: number
}

export type InputOpts = {
  value: string
  fontPx?: number
  active: boolean
  onActivate(): void
}

/**
 * Кнопка с фоном/border/label, hit-rect внутри. Использовать в render():
 *   button(this, x, y, w, h, {label: "Pause", tone: "warn", action: () => ...})
 */
export function button(card: Card, x: number, y: number, w: number, h: number, opts: ButtonOpts): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? 12
  const fill = toneFill(tone)
  const borderColor = toneBorder(tone)
  card.drawRect(x, y, w, h, fill, Z.ELEMENT)
  card.drawRect(x, y, w, 1, borderColor, Z.ELEMENT_RULE)
  card.drawRect(x, y + h - 1, w, 1, palette.border, Z.ELEMENT_RULE)
  card.drawRect(x, y, 1, h, palette.border, Z.ELEMENT_RULE)
  card.drawRect(x + w - 1, y, 1, h, palette.border, Z.ELEMENT_RULE)
  const labelW = card.measureText(opts.label, fontPx)
  const labelX = x + (w - labelW) / 2
  card.drawText(opts.label, labelX, y + (h - fontPx) / 2, {
    fontPx,
    material: card.materials.toneText(tone),
    maxWidthPx: w - 6,
  })
  card.hit(x, y, w, h, opts.action, "pointer")
}

/** Бейдж: tone-fill + colored top-line + label. */
export function badge(card: Card, x: number, y: number, w: number, h: number, opts: BadgeOpts): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? 11
  card.drawRect(x, y, w, h, toneFill(tone), Z.ELEMENT)
  card.drawRect(x, y, w, 1, toneBorder(tone), Z.ELEMENT_RULE)
  card.drawText(opts.label, x + 8, y + (h - fontPx) / 2, {
    fontPx,
    material: card.materials.toneText(tone),
    maxWidthPx: w - 16,
  })
}

/** Текстовый input: bg/border, value, hit для активации. */
export function input(card: Card, x: number, y: number, w: number, h: number, opts: InputOpts): void {
  const fontPx = opts.fontPx ?? 12
  card.drawRect(x, y, w, h, opts.active ? palette.bgHot : palette.bgInput, Z.ELEMENT)
  card.drawRect(x, y, w, 1, opts.active ? palette.cyan : palette.borderDim, Z.ELEMENT_RULE)
  card.drawRect(x, y + h - 1, w, 1, palette.borderDim, Z.ELEMENT_RULE)
  card.drawRect(x, y, 1, h, palette.borderDim, Z.ELEMENT_RULE)
  card.drawRect(x + w - 1, y, 1, h, palette.borderDim, Z.ELEMENT_RULE)
  const display = opts.active ? `${opts.value}|` : opts.value
  card.drawText(display, x + 10, y + (h - fontPx) / 2, {
    fontPx,
    material: opts.active ? card.materials.text : card.materials.muted,
    maxWidthPx: w - 20,
  })
  card.hit(x, y, w, h, opts.onActivate, "text")
}

/** Горизонтальная разделительная линия 1px, низкий z. */
export function divider(card: Card, x: number, y: number, w: number): void {
  card.drawRect(x, y, w, 1, palette.borderDim, Z.SEPARATOR)
}

/**
 * Помощник для measure-based авто-ширины кнопки с padding.
 * `auto-button` сам считает width = labelW + paddingX*2.
 */
export function autoButtonWidth(card: Card, label: string, fontPx = 12, paddingX = 12): number {
  return Math.ceil(card.measureText(label, fontPx)) + paddingX * 2
}

export type ScrollbarOpts = {
  /** Текущий scrollOffset (0..maxScroll). */
  offset: number
  /** Сколько строк/items видно на экране. */
  visible: number
  /** Всего items. */
  total: number
  /** Толщина track'а в px. Default 4. */
  trackWidth?: number
  /** Min thumb height в px (чтобы не превратилось в точку при огромном total). Default 16. */
  minThumbHeight?: number
}

/**
 * Вертикальный scrollbar (track + thumb). x — правый верхний угол track'а
 * в card-px coords, y — top, h — высота track'а. Если visible >= total
 * (всё помещается) — не рисуется.
 */
export function scrollbar(card: Card, x: number, y: number, h: number, opts: ScrollbarOpts): void {
  if (opts.total <= opts.visible) return
  const tw = opts.trackWidth ?? 4
  const minThumb = opts.minThumbHeight ?? 16
  // Track.
  card.drawRect(x, y, tw, h, palette.borderDim, Z.SEPARATOR)
  // Thumb.
  const ratio = opts.visible / opts.total
  const thumbH = Math.max(minThumb, Math.floor(h * ratio))
  const range = h - thumbH
  const maxOffset = Math.max(1, opts.total - opts.visible)
  const thumbY = y + Math.floor(range * (opts.offset / maxOffset))
  card.drawRect(x, thumbY, tw, thumbH, palette.muted, Z.ELEMENT)
}
