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
  /** Override фона (вместо toneFill). */
  fill?: Color
  /** Override рамки (вместо toneBorder). */
  border?: Color
  /** Override TextMaterial для лейбла (вместо tone-палитры). */
  textMaterial?: import("@metafor/engine").TextMaterial
}

export type CircleButtonOpts = {
  label: string
  tone?: Tone
  fontPx?: number
  /** Дополнительный цвет рамки/заливки (override toneBorder/toneFill). */
  fill?: Color
  border?: Color
  textColor?: Color
  /**
   * Сдвиг текстового лейбла по Y в долях fontPx. drawText располагает текст
   * по top-of-cap, а не по визуальному центру глифа: для математических
   * символов ("+", "−") и guillemets ("‹", "›") визуальный центр обычно
   * выше центра cap-box, поэтому полезно сместить лейбл на -0.05..-0.12.
   * Default 0 (центр cap-box).
   */
  labelOffsetY?: number
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
  const fill = opts.fill ?? toneFill(tone)
  const borderColor = opts.border ?? toneBorder(tone)
  const textMat = opts.textMaterial ?? card.materials.toneText(tone)
  const r = Math.min(opts.radius ?? Math.min(w, h) / 2, Math.min(w, h) / 2)

  drawRoundedFill(card, x, y, w, h, r, fill)
  drawRoundedBorder(card, x, y, w, h, r, borderColor)

  // drawTextCentered — bbox-aware центровка. maxWidthPx = w - небольшой
  // safe-padding от каждого края (а не w - 2r, что обрезало бы текст до
  // прямой части capsule, что слишком жёстко: текст хорошо помещается до
  // самих кромок благодаря центру и rounded углам).
  const safePadH = Math.min(r, 8)
  card.drawTextCentered(opts.label, x + w / 2, y + h / 2, {
    fontPx,
    material: textMat,
    maxWidthPx: w - safePadH * 2,
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
  // drawTextCentered учитывает реальный bbox глифа (yMin/yMax из getGlyphBounds),
  // поэтому "+", "−", "‹", "›" и прочие non-cap-letter глифы тоже центрируются
  // визуально, а не по cap-box. labelOffsetY игнорируется как deprecated;
  // оставляем как опт-out: если задан, используется старая cap-box-центровка.
  if (opts.labelOffsetY !== undefined) {
    const labelW = card.measureText(opts.label, fontPx)
    const offsetY = opts.labelOffsetY * fontPx
    card.drawText(opts.label, cx - labelW / 2, cy - fontPx / 2 + offsetY, {
      fontPx,
      material: card.materials.toneText(tone),
    })
  } else {
    card.drawTextCentered(opts.label, cx, cy, {
      fontPx,
      material: card.materials.toneText(tone),
    })
  }
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
  // Левый и правый скруглённые края — рисуем по строкам, заполняя
  // дельту между соседними строками, чтобы pixel-staircase сомкнулся.
  for (let dy = 0; dy < h; dy++) {
    const dx = cornerInset(dy, h, r)
    const dxNext = cornerInset(dy + 1, h, r)
    const dxPrev = cornerInset(dy - 1, h, r)
    const stepDelta = Math.max(Math.abs(dx - dxPrev), Math.abs(dx - dxNext), 1)
    card.drawRect(x + dx, y + dy, stepDelta, 1, color, Z.ELEMENT_RULE)
    card.drawRect(x + w - dx - stepDelta, y + dy, stepDelta, 1, color, Z.ELEMENT_RULE)
  }
  // Прямые верхний/нижний участки (между скруглёнными углами).
  // Для capsule (r = h/2) длина = w - 2r > 0 если w > h; иначе пропускается.
  const straight = w - 2 * r
  if (straight > 0) {
    card.drawRect(x + r, y, straight, 1, color, Z.ELEMENT_RULE)
    card.drawRect(x + r, y + h - 1, straight, 1, color, Z.ELEMENT_RULE)
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

export type DividerOpts = {
  /** Цвет линии. По умолчанию palette.borderDim. */
  color?: Color
  /** Толщина в px. По умолчанию 1. */
  thickness?: number
  /** z-уровень. По умолчанию Z.SEPARATOR. */
  z?: number
}

/** Горизонтальная разделительная линия. По умолчанию 1px palette.borderDim
 *  на Z.SEPARATOR. Цвет/толщину/z можно переопределить через opts.
 *  rectY — координата центра линии (y нарисуется в y - thickness/2). */
export function divider(card: Card, x: number, y: number, w: number, opts: DividerOpts = {}): void {
  const t = opts.thickness ?? 1
  const color = opts.color ?? palette.borderDim
  const z = opts.z ?? Z.SEPARATOR
  card.drawRect(x, Math.round(y - t / 2), w, t, color, z)
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
