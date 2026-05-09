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
import type {Color} from "@metafor/engine"

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

export type RoundedButtonOpts = ButtonOpts & {
  /** border-radius в px. h/2 даёт capsule-форму. Default = min(w,h)/2 (capsule). */
  radius?: number
}

export type CircleButtonOpts = {
  label: string
  tone?: Tone
  fontPx?: number
  /** Дополнительный цвет рамки/заливки (override toneBorder/toneFill). */
  fill?: Color
  border?: Color
  textColor?: Color
  action(): void
}

/**
 * Кнопка с border-radius. Использует Card primitives drawRect только.
 * radius до min(w,h)/2 (capsule). В отличие от {@link button}, не примыкает
 * к пиксельной сетке углов — фон и рамка скруглены через 1-px strip-rendering.
 */
export function roundedButton(
  card: Card,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: RoundedButtonOpts,
): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? 12
  const fill = toneFill(tone)
  const borderColor = toneBorder(tone)
  const r = Math.min(opts.radius ?? Math.min(w, h) / 2, Math.min(w, h) / 2)

  drawRoundedFill(card, x, y, w, h, r, fill)
  drawRoundedBorder(card, x, y, w, h, r, borderColor)

  const labelW = card.measureText(opts.label, fontPx)
  card.drawText(opts.label, x + (w - labelW) / 2, y + (h - fontPx) / 2, {
    fontPx,
    material: card.materials.toneText(tone),
    maxWidthPx: w - r * 2,
  })
  card.hit(x, y, w, h, opts.action, "pointer")
}

/**
 * Полностью круглая кнопка. (cx, cy) — центр в card-px, r — радиус.
 * Hit-rect — описанный квадрат (для простоты; расхождения внутри 4 угловых
 * квадратиков не страшны для tap-gestures).
 */
export function circleButton(card: Card, cx: number, cy: number, r: number, opts: CircleButtonOpts): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? Math.max(10, Math.round(r * 0.9))
  const fill = opts.fill ?? toneFill(tone)
  const borderColor = opts.border ?? toneBorder(tone)
  drawDisc(card, cx, cy, r, fill)
  drawRingStroke(card, cx, cy, r, borderColor)
  const labelW = card.measureText(opts.label, fontPx)
  card.drawText(opts.label, cx - labelW / 2, cy - fontPx / 2, {
    fontPx,
    material: card.materials.toneText(tone),
  })
  card.hit(cx - r, cy - r, r * 2, r * 2, opts.action, "pointer")
}

// ─────────────────────── Rounded primitives ───────────────────────

/** Чистая заливка rounded-rect (без рамки) через горизонтальные 1-px strips. */
function drawRoundedFill(
  card: Card,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: Color,
): void {
  if (r <= 0) {
    card.drawRect(x, y, w, h, color, Z.ELEMENT)
    return
  }
  for (let dy = 0; dy < h; dy++) {
    const dx = cornerInset(dy, h, r)
    card.drawRect(x + dx, y + dy, w - dx * 2, 1, color, Z.ELEMENT)
  }
}

/** 1-px рамка вдоль контура rounded-rect. */
function drawRoundedBorder(
  card: Card,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: Color,
): void {
  if (r <= 0) {
    card.drawRect(x, y, w, 1, color, Z.ELEMENT_RULE)
    card.drawRect(x, y + h - 1, w, 1, color, Z.ELEMENT_RULE)
    card.drawRect(x, y, 1, h, color, Z.ELEMENT_RULE)
    card.drawRect(x + w - 1, y, 1, h, color, Z.ELEMENT_RULE)
    return
  }
  for (let dy = 0; dy < h; dy++) {
    const dx = cornerInset(dy, h, r)
    const dxNext = cornerInset(dy + 1, h, r)
    const dxPrev = cornerInset(dy - 1, h, r)
    // в зоне углов толщина рамки + дельта между соседними строками,
    // чтобы покрыть стыки скруглённой кромки 1-px пикселями.
    const stepDelta = Math.max(Math.abs(dx - dxPrev), Math.abs(dx - dxNext), 1)
    // Левый край
    card.drawRect(x + dx, y + dy, stepDelta, 1, color, Z.ELEMENT_RULE)
    // Правый край
    card.drawRect(x + w - dx - stepDelta, y + dy, stepDelta, 1, color, Z.ELEMENT_RULE)
  }
}

/** Сжатие края rounded-rect для строки `dy` (0..h-1). */
function cornerInset(dy: number, h: number, r: number): number {
  if (dy >= r && dy < h - r) return 0
  // расстояние от центра ближайшей дуги
  const cy = dy < r ? r - dy - 1 : dy - (h - r)
  const v = r * r - cy * cy
  if (v <= 0) return r
  return Math.max(0, Math.round(r - Math.sqrt(v)))
}

/** Сплошной диск радиуса r вокруг (cx, cy). */
function drawDisc(card: Card, cx: number, cy: number, r: number, color: Color): void {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy)) * 2
    if (w <= 0) continue
    card.drawRect(Math.round(cx - w / 2), Math.round(cy + dy), w, 1, color, Z.ELEMENT)
  }
}

/** 1-px (по dy) обводка круга: разница между большим и маленьким диском. */
function drawRingStroke(card: Card, cx: number, cy: number, r: number, color: Color): void {
  const rIn = Math.max(0, r - 1)
  for (let dy = -r; dy <= r; dy++) {
    const wOut = Math.sqrt(r * r - dy * dy)
    if (wOut <= 0) continue
    const inSide = Math.abs(dy) <= rIn ? Math.sqrt(rIn * rIn - dy * dy) : 0
    if (inSide === 0) {
      card.drawRect(Math.round(cx - wOut), Math.round(cy + dy), Math.round(wOut * 2), 1, color, Z.ELEMENT_RULE)
    } else {
      card.drawRect(Math.round(cx - wOut), Math.round(cy + dy), Math.round(wOut - inSide), 1, color, Z.ELEMENT_RULE)
      card.drawRect(
        Math.round(cx + inSide),
        Math.round(cy + dy),
        Math.round(wOut - inSide),
        1,
        color,
        Z.ELEMENT_RULE,
      )
    }
  }
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
