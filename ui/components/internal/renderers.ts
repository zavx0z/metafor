/**
 * Internal renderers behind MUI-like components.
 * Public code imports Button/Badge/TextField/etc. from @metafor/components;
 * this file only keeps the low-level drawing path shared and allocation-light.
 */

import {Z, type Pane, palette, type Tone, toneBorder, toneFill} from "@metafor/elements"
import {Color} from "@metafor/engine"

export type BadgeOpts = {
  label: string
  tone?: Tone
  fontPx?: number
}

export type StatusChipOpts = {
  label: string
  iconSrc?: string
  indicator?: boolean
  tone?: Tone
  fontPx?: number
  iconSizePx?: number
  tooltip?: string
  tooltipDelayMs?: number
  action?: () => void
}

export type InputOpts = {
  value: string
  fontPx?: number
  active: boolean
  onActivate(): void
}

function mixColor(a: Color, b: Color, t: number): Color {
  const k = Math.min(1, Math.max(0, t))
  return new Color(
    a.r + (b.r - a.r) * k,
    a.g + (b.g - a.g) * k,
    a.b + (b.b - a.b) * k,
    a.a + (b.a - a.a) * k,
  )
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, Math.min(1, Math.max(0, alpha)))
}

// Старые strip-loop утилиты (drawRoundedFill / drawRoundedBorder / drawDisc /
// drawRingStroke / cornerInset) удалены — теперь Pane.drawRoundedRect рисует
// то же через SDF в шейдере с идеальным AA. Лесенка на углах больше не
// воспроизводится.

/** Бейдж: tone-fill + colored top-line + label. */
export function badge(pane: Pane, x: number, y: number, w: number, h: number, opts: BadgeOpts): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? 11
  pane.drawRoundedRect(x, y, w, h, {
    radius: Math.min(w, h) / 2,
    fill: toneFill(tone),
    border: toneBorder(tone),
    borderWidth: 1,
    z: Z.ELEMENT,
  })
  pane.drawText(opts.label, x + 8, y + (h - fontPx) / 2, {
    fontPx,
    material: pane.materials.toneText(tone),
    maxWidthPx: w - 16,
  })
}

/** Status chip: compact read-only state pill with optional SVG icon and delayed tooltip. */
export function statusChip(pane: Pane, x: number, y: number, w: number, h: number, opts: StatusChipOpts): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? 11
  const iconSize = Math.min(opts.iconSizePx ?? Math.max(12, h - 12), Math.max(1, h - 8))
  pane.drawRoundedRect(x, y, w, h, {
    radius: Math.min(w, h) / 2,
    fill: toneFill(tone),
    border: toneBorder(tone),
    borderWidth: 1,
    z: Z.ELEMENT,
  })

  let tx = x + 9
  const hasLabel = opts.label.length > 0
  if (opts.indicator === true && opts.iconSrc !== undefined && opts.iconSrc.length > 0) {
    const iconSizeForIndicator = Math.min(iconSize, 13)
    pane.drawImage(opts.iconSrc, tx, y + (h - iconSizeForIndicator) / 2, iconSizeForIndicator, iconSizeForIndicator, {
      fit: "contain",
      opacity: 0.95,
      z: Z.TEXT,
    })
    tx += iconSizeForIndicator + 8
  } else if (opts.indicator === true) {
    const dot = Math.min(9, h - 16)
    const dotY = y + (h - dot) / 2
    pane.drawRoundedRect(tx, dotY, dot, dot, {
      radius: dot / 2,
      fill: toneBorder(tone),
      z: Z.TEXT,
    })
    tx += dot + 8
  } else if (opts.iconSrc !== undefined && opts.iconSrc.length > 0) {
    const iconX = hasLabel ? tx : x + (w - iconSize) / 2
    pane.drawImage(opts.iconSrc, iconX, y + (h - iconSize) / 2, iconSize, iconSize, {
      fit: "contain",
      opacity: 0.92,
      z: Z.TEXT,
    })
    tx += iconSize + 7
  }
  if (hasLabel) {
    pane.drawText(opts.label, tx, y + (h - fontPx) / 2, {
      fontPx,
      material: pane.materials.toneText(tone),
      maxWidthPx: Math.max(1, x + w - tx - 9),
    })
  }

  if (opts.tooltip !== undefined && opts.tooltip.length > 0) {
    const delayMs = opts.tooltipDelayMs ?? 450
    pane.hit(x, y, w, h, opts.action ?? (() => {}), opts.action === undefined ? "default" : "pointer", {label: opts.tooltip, delayMs})
    pane.drawTooltipForHit(x, y, w, h, opts.tooltip, {delayMs})
  } else if (opts.action !== undefined) {
    pane.hit(x, y, w, h, opts.action, "pointer")
  }
}

/** Текстовый input: bg/border, value, hit для активации. */
export function input(pane: Pane, x: number, y: number, w: number, h: number, opts: InputOpts): void {
  const fontPx = opts.fontPx ?? 12
  pane.drawRoundedRect(x, y, w, h, {
    radius: Math.min(w, h) / 2,
    fill: opts.active ? palette.bgHot : palette.bgInput,
    border: opts.active ? palette.cyan : palette.borderDim,
    borderWidth: 1,
    z: Z.ELEMENT,
  })
  const display = opts.active ? `${opts.value}|` : opts.value
  pane.drawText(display, x + 10, y + (h - fontPx) / 2, {
    fontPx,
    material: opts.active ? pane.materials.text : pane.materials.muted,
    maxWidthPx: w - 20,
  })
  pane.hit(x, y, w, h, opts.onActivate, "text")
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
export function divider(pane: Pane, x: number, y: number, w: number, opts: DividerOpts = {}): void {
  const t = opts.thickness ?? 1
  const color = opts.color ?? palette.borderDim
  const z = opts.z ?? Z.SEPARATOR
  pane.drawRect(x, Math.round(y - t / 2), w, t, color, z)
}

/**
 * Помощник для measure-based авто-ширины кнопки с padding.
 * `auto-button` сам считает width = labelW + paddingX*2.
 */
export function autoButtonWidth(pane: Pane, label: string, fontPx = 12, paddingX = 12, iconSrc?: string): number {
  const iconW = iconSrc === undefined || iconSrc.length === 0 ? 0 : fontPx + 1 + (label.length > 0 ? 7 : 0)
  return Math.ceil(iconW + pane.measureText(label, fontPx)) + paddingX * 2
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
 * в pane-px coords, y — top, h — высота track'а. Если visible >= total
 * (всё помещается) — не рисуется.
 */
export function scrollbar(pane: Pane, x: number, y: number, h: number, opts: ScrollbarOpts): void {
  if (opts.total <= opts.visible) return
  const tw = opts.trackWidth ?? 4
  const minThumb = opts.minThumbHeight ?? 16
  // Track.
  pane.drawRoundedRect(x, y, tw, h, {
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
  pane.drawRoundedRect(x, thumbY, tw, thumbH, {
    radius: tw / 2,
    fill: palette.muted,
    z: Z.ELEMENT,
  })
}
