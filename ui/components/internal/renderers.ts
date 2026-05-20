/**
 * Internal renderers behind MUI-like components.
 * Public code imports Button/Badge/TextField/etc. from @metafor/components;
 * this file only keeps the low-level drawing path shared and allocation-light.
 */

import {Z, type Card, type HitOptions, palette, type Tone, toneBorder, toneFill} from "@metafor/elements"
import {Color, type TextMaterial} from "@metafor/engine"

export type ButtonOpts = {
  label: string
  iconSrc?: string
  iconPosition?: "start" | "end"
  iconOnly?: boolean
  iconSizePx?: number
  tooltip?: string
  tooltipDelayMs?: number
  tone?: Tone
  fontPx?: number
  /** border-radius в px. Default = min(w,h)/2 (capsule). */
  radius?: number
  /** Override фона (вместо toneFill). */
  fill?: Color
  /** Override рамки (вместо toneBorder). */
  border?: Color
  /** Override TextMaterial для лейбла (вместо tone-палитры). */
  textMaterial?: TextMaterial
  disabled?: boolean
  onHover?: () => void
  onLeave?: () => void
  onPress?: () => void
  onRelease?: () => void
  action(): void
}

type ButtonVisualState = "idle" | "hover" | "active" | "disabled"

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

/**
 * Кнопка с фоном/border/label, hit-rect внутри. Использовать в render():
 *   button(this, x, y, w, h, {label: "Pause", tone: "warn", action: () => ...})
 */
export function button(card: Card, x: number, y: number, w: number, h: number, opts: ButtonOpts): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? 12
  const disabled = opts.disabled === true
  const state = resolveButtonState(card, x, y, w, h, disabled)
  const baseFill = opts.fill ?? toneFill(tone)
  const baseBorder = opts.border ?? toneBorder(tone)
  const fill = buttonFill(baseFill, baseBorder, state)
  const borderColor = buttonBorder(baseBorder, state)
  const textMaterial = disabled ? card.materials.muted : opts.textMaterial ?? card.materials.toneText(tone)
  const radius = Math.min(opts.radius ?? Math.min(w, h) / 2, Math.min(w, h) / 2)
  const pressOffsetY = state === "active" ? 1 : 0
  drawButtonSurface(card, x, y + pressOffsetY, w, h - pressOffsetY, radius, fill, borderColor, state)

  if (opts.iconSrc !== undefined && opts.iconSrc.length > 0) {
    const iconSize = Math.min(opts.iconSizePx ?? Math.max(14, h - 12), Math.max(1, h - 8), Math.max(1, w - 8))
    const showLabel = opts.iconOnly !== true && opts.label.length > 0
    const labelW = showLabel ? card.measureText(opts.label, fontPx) : 0
    const gap = showLabel ? 7 : 0
    const contentW = Math.min(w - 8, iconSize + gap + labelW)
    let cx = x + (w - contentW) / 2
    const iconY = y + pressOffsetY + (h - iconSize) / 2
    const textY = y + pressOffsetY + (h - fontPx) / 2
    const iconOpacity = disabled ? 0.36 : 0.95
    if (opts.iconPosition === "end" && showLabel) {
      const available = Math.max(1, w - iconSize - gap - 10)
      card.drawText(opts.label, cx, textY, {
        fontPx,
        material: textMaterial,
        maxWidthPx: available,
      })
      card.drawImage(opts.iconSrc, cx + Math.min(labelW, available) + gap, iconY, iconSize, iconSize, {
        fit: "contain",
        opacity: iconOpacity,
        z: Z.TEXT,
      })
    } else {
      card.drawImage(opts.iconSrc, cx, iconY, iconSize, iconSize, {
        fit: "contain",
        opacity: iconOpacity,
        z: Z.TEXT,
      })
      cx += iconSize + gap
      if (showLabel) {
        const available = Math.max(1, x + w - 5 - cx)
        card.drawText(opts.label, cx, textY, {
          fontPx,
          material: textMaterial,
          maxWidthPx: available,
        })
      }
    }
  } else {
    card.drawTextCentered(opts.label, x + w / 2, y + pressOffsetY + h / 2, {
      fontPx,
      material: textMaterial,
      maxWidthPx: w - 6,
    })
  }
  const tooltipLabel = opts.tooltip ?? (opts.iconOnly === true ? opts.label : "")
  card.hit(x, y, w, h, opts.action, buttonHitOptions(opts, tooltipLabel))
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

function resolveButtonState(card: Card, x: number, y: number, w: number, h: number, disabled: boolean): ButtonVisualState {
  if (disabled) return "disabled"
  const state = card.hitState(x, y, w, h)
  if (state.pressed) return "active"
  if (state.hovered) return "hover"
  return "idle"
}

function buttonHitOptions(opts: ButtonOpts, tooltipLabel: string): HitOptions {
  const hit: HitOptions = {
    cursor: "pointer",
    disabled: opts.disabled === true,
  }
  if (tooltipLabel.length > 0) hit.tooltip = {label: tooltipLabel, delayMs: opts.tooltipDelayMs ?? 450}
  if (opts.onHover !== undefined) hit.onPointerEnter = opts.onHover
  if (opts.onLeave !== undefined) hit.onPointerLeave = opts.onLeave
  if (opts.onPress !== undefined) hit.onPointerDown = opts.onPress
  if (opts.onRelease !== undefined) hit.onPointerUp = opts.onRelease
  return hit
}

function buttonFill(fill: Color, border: Color, state: ButtonVisualState): Color {
  if (state === "disabled") return withAlpha(mixColor(palette.bgPanel, palette.bgElevated, 0.28), 0.58)
  const frost = mixColor(palette.bgElevated, palette.text, 0.10)
  const glass = mixColor(frost, fill, 0.38)
  const tint = state === "active" ? 0.40 : state === "hover" ? 0.30 : 0.20
  const alpha = state === "active" ? 0.96 : state === "hover" ? 0.90 : 0.80
  return withAlpha(mixColor(glass, border, tint), alpha)
}

function buttonBorder(border: Color, state: ButtonVisualState): Color {
  if (state === "disabled") return withAlpha(palette.borderDim, 0.62)
  const lift = state === "active" ? 0.52 : state === "hover" ? 0.40 : 0.26
  const alpha = state === "idle" ? 0.78 : 1
  return withAlpha(mixColor(border, palette.text, lift), alpha)
}

function drawButtonSurface(
  card: Card,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill: Color,
  border: Color,
  state: ButtonVisualState,
): void {
  if (w <= 0 || h <= 0) return
  const disabled = state === "disabled"
  if (!disabled && state !== "idle") {
    card.drawRoundedRect(x - 2, y - 2, w + 4, h + 4, {
      radius: radius + 2,
      fill: withAlpha(border, state === "hover" ? 0.16 : 0.10),
      border: null,
      z: Z.ELEMENT - 0.00001,
    })
  }

  card.drawRoundedRect(x, y, w, h, {
    radius,
    fill,
    border,
    borderWidth: disabled ? 0.75 : 1,
    z: Z.ELEMENT,
  })

  // Keep the idle surface to one rounded rect; hover/active already get one aura layer.
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
// drawRingStroke / cornerInset) удалены — теперь Card.drawRoundedRect рисует
// то же через SDF в шейдере с идеальным AA. Лесенка на углах больше не
// воспроизводится.

/** Бейдж: tone-fill + colored top-line + label. */
export function badge(card: Card, x: number, y: number, w: number, h: number, opts: BadgeOpts): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? 11
  card.drawRoundedRect(x, y, w, h, {
    radius: Math.min(w, h) / 2,
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

/** Status chip: compact read-only state pill with optional SVG icon and delayed tooltip. */
export function statusChip(card: Card, x: number, y: number, w: number, h: number, opts: StatusChipOpts): void {
  const tone = opts.tone ?? "neutral"
  const fontPx = opts.fontPx ?? 11
  const iconSize = Math.min(opts.iconSizePx ?? Math.max(12, h - 12), Math.max(1, h - 8))
  card.drawRoundedRect(x, y, w, h, {
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
    card.drawImage(opts.iconSrc, tx, y + (h - iconSizeForIndicator) / 2, iconSizeForIndicator, iconSizeForIndicator, {
      fit: "contain",
      opacity: 0.95,
      z: Z.TEXT,
    })
    tx += iconSizeForIndicator + 8
  } else if (opts.indicator === true) {
    const dot = Math.min(9, h - 16)
    const dotY = y + (h - dot) / 2
    card.drawRoundedRect(tx, dotY, dot, dot, {
      radius: dot / 2,
      fill: toneBorder(tone),
      z: Z.TEXT,
    })
    tx += dot + 8
  } else if (opts.iconSrc !== undefined && opts.iconSrc.length > 0) {
    const iconX = hasLabel ? tx : x + (w - iconSize) / 2
    card.drawImage(opts.iconSrc, iconX, y + (h - iconSize) / 2, iconSize, iconSize, {
      fit: "contain",
      opacity: 0.92,
      z: Z.TEXT,
    })
    tx += iconSize + 7
  }
  if (hasLabel) {
    card.drawText(opts.label, tx, y + (h - fontPx) / 2, {
      fontPx,
      material: card.materials.toneText(tone),
      maxWidthPx: Math.max(1, x + w - tx - 9),
    })
  }

  if (opts.tooltip !== undefined && opts.tooltip.length > 0) {
    const delayMs = opts.tooltipDelayMs ?? 450
    card.hit(x, y, w, h, opts.action ?? (() => {}), opts.action === undefined ? "default" : "pointer", {label: opts.tooltip, delayMs})
    card.drawTooltipForHit(x, y, w, h, opts.tooltip, {delayMs})
  } else if (opts.action !== undefined) {
    card.hit(x, y, w, h, opts.action, "pointer")
  }
}

/** Текстовый input: bg/border, value, hit для активации. */
export function input(card: Card, x: number, y: number, w: number, h: number, opts: InputOpts): void {
  const fontPx = opts.fontPx ?? 12
  card.drawRoundedRect(x, y, w, h, {
    radius: Math.min(w, h) / 2,
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
