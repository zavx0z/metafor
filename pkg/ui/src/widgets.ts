/**
 * Widget-функции для использования внутри Card.render(). Принимают
 * Card как первый аргумент и используют его public-primitives drawText/
 * drawRect/measureText/hit.
 *
 * Не классы — карточкам не нужен лишний state. Виджеты — это просто
 * "draw-this-thing-here" утилиты с консистентным look-and-feel.
 */

import {Z, type Card} from "./card.ts"
import {palette, radii, type Tone, toneBorder, toneFill} from "./theme.ts"
import type {Color} from "@metafor/engine"

export type ButtonOpts = {
  label: string
  iconSrc?: string
  iconOnly?: boolean
  iconSizePx?: number
  tooltip?: string
  tooltipDelayMs?: number
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
  const textMaterial = card.materials.toneText(tone)
  const radius = Math.min(radii.control, h / 2)
  card.drawRoundedRect(x, y, w, h, {
    radius,
    fill,
    border: borderColor,
    borderWidth: 1,
    z: Z.ELEMENT,
  })

  if (opts.iconSrc !== undefined && opts.iconSrc.length > 0) {
    const iconSize = Math.min(opts.iconSizePx ?? Math.max(14, h - 12), Math.max(1, h - 8), Math.max(1, w - 8))
    const showLabel = opts.iconOnly !== true && opts.label.length > 0
    const labelW = showLabel ? card.measureText(opts.label, fontPx) : 0
    const gap = showLabel ? 7 : 0
    const contentW = Math.min(w - 8, iconSize + gap + labelW)
    let cx = x + (w - contentW) / 2
    card.drawImage(opts.iconSrc, cx, y + (h - iconSize) / 2, iconSize, iconSize, {
      fit: "contain",
      opacity: 0.95,
      z: Z.TEXT,
    })
    cx += iconSize + gap
    if (showLabel) {
      const available = Math.max(1, x + w - 5 - cx)
      card.drawText(opts.label, cx, y + (h - fontPx) / 2, {
        fontPx,
        material: textMaterial,
        maxWidthPx: available,
      })
    }
  } else {
    card.drawTextCentered(opts.label, x + w / 2, y + h / 2, {
      fontPx,
      material: textMaterial,
      maxWidthPx: w - 6,
    })
  }
  const tooltipLabel = opts.tooltip ?? (opts.iconOnly === true ? opts.label : "")
  card.hit(
    x,
    y,
    w,
    h,
    opts.action,
    "pointer",
    tooltipLabel.length > 0 ? {label: tooltipLabel, delayMs: opts.tooltipDelayMs ?? 450} : undefined,
  )
  if (tooltipLabel.length > 0) {
    card.drawTooltipForHit(
      x,
      y,
      w,
      h,
      tooltipLabel,
      opts.tooltipDelayMs === undefined ? {} : {delayMs: opts.tooltipDelayMs},
    )
  }
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
 * Кнопка с border-radius. Под капотом — Card.drawRoundedRect с SDF-материалом
 * в шейдере: один меш на всю кнопку, идеальное AA на углах независимо от dpr.
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

  card.drawRoundedRect(x, y, w, h, {
    radius: r,
    fill,
    border: borderColor,
    borderWidth: 1,
    z: Z.ELEMENT,
  })

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
 * квадратиков не страшны для tap-gestures). Круг = rounded rect с radius=r.
 */
export function circleButton(card: Card, cx: number, cy: number, r: number, opts: CircleButtonOpts): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? Math.max(10, Math.round(r * 0.9))
  const fill = opts.fill ?? toneFill(tone)
  const borderColor = opts.border ?? toneBorder(tone)
  card.drawRoundedRect(cx - r, cy - r, r * 2, r * 2, {
    radius: r,
    fill,
    border: borderColor,
    borderWidth: 1,
    z: Z.ELEMENT,
  })
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

// Старые strip-loop утилиты (drawRoundedFill / drawRoundedBorder / drawDisc /
// drawRingStroke / cornerInset) удалены — теперь Card.drawRoundedRect рисует
// то же через SDF в шейдере с идеальным AA. Лесенка на углах больше не
// воспроизводится.

/** Бейдж: tone-fill + colored top-line + label. */
export function badge(card: Card, x: number, y: number, w: number, h: number, opts: BadgeOpts): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? 11
  card.drawRoundedRect(x, y, w, h, {
    radius: Math.min(radii.control, h / 2),
    fill: toneFill(tone),
    border: toneBorder(tone),
    borderWidth: 1,
    z: Z.ELEMENT,
  })
  card.drawText(opts.label, x + 8, y + (h - fontPx) / 2, {
    fontPx,
    material: card.materials.toneText(tone),
    maxWidthPx: w - 16,
  })
}

/** Текстовый input: bg/border, value, hit для активации. */
export function input(card: Card, x: number, y: number, w: number, h: number, opts: InputOpts): void {
  const fontPx = opts.fontPx ?? 12
  card.drawRoundedRect(x, y, w, h, {
    radius: Math.min(radii.control, h / 2),
    fill: opts.active ? palette.bgHot : palette.bgInput,
    border: opts.active ? palette.cyan : palette.borderDim,
    borderWidth: 1,
    z: Z.ELEMENT,
  })
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
export function autoButtonWidth(card: Card, label: string, fontPx = 12, paddingX = 12, iconSrc?: string): number {
  const iconW = iconSrc === undefined || iconSrc.length === 0 ? 0 : fontPx + 1 + (label.length > 0 ? 7 : 0)
  return Math.ceil(iconW + card.measureText(label, fontPx)) + paddingX * 2
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
  card.drawRoundedRect(x, y, tw, h, {
    radius: tw / 2,
    fill: palette.borderDim,
    z: Z.SEPARATOR,
  })
  // Thumb.
  const ratio = opts.visible / opts.total
  const thumbH = Math.max(minThumb, Math.floor(h * ratio))
  const range = h - thumbH
  const maxOffset = Math.max(1, opts.total - opts.visible)
  const thumbY = y + Math.floor(range * (opts.offset / maxOffset))
  card.drawRoundedRect(x, thumbY, tw, thumbH, {
    radius: tw / 2,
    fill: palette.muted,
    z: Z.ELEMENT,
  })
}
