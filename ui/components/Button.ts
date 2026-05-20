import {autoButtonWidth} from "./internal/renderers.ts"
import {Z} from "@metafor/elements"
import {button as elementButton, palette, toneBorder, toneFill, type Card, type HtmlElementProps, type StyleProps} from "@metafor/elements"
import type {Tone} from "@metafor/elements"
import {Color, TextMaterial} from "@metafor/engine"

export type ButtonVariant = "text" | "outlined" | "contained" | "glass"
export type ButtonColor = "primary" | "neutral" | "success" | "warning" | "error"
export type ButtonSize = "small" | "medium" | "large"
type ButtonVisualState = "idle" | "hover" | "active" | "disabled"

export type ButtonProps = {
  children?: string
  label?: string
  variant?: ButtonVariant
  color?: ButtonColor
  tone?: Tone
  size?: ButtonSize
  fontPx?: number
  radius?: number
  disabled?: boolean
  startIcon?: string
  endIcon?: string
  iconSrc?: string
  iconPosition?: "start" | "end"
  iconOnly?: boolean
  iconSizePx?: number
  tooltip?: string
  tooltipDelayMs?: number
  fill?: Color
  border?: Color
  textMaterial?: TextMaterial
  sx?: StyleProps
  onClick?: () => void
  action?: () => void
  onHover?: () => void
  onLeave?: () => void
  onPress?: () => void
  onRelease?: () => void
}

export function Button(host: Card, x: number, y: number, width: number, height: number, props: ButtonProps): void {
  const label = props.label ?? props.children ?? ""
  const tone = props.tone ?? toneFromColor(props.color ?? "primary")
  const fontPx = props.fontPx ?? (props.size === "small" ? 10 : props.size === "large" ? 14 : 12)
  const variant = props.variant ?? "glass"
  const radius = props.radius ?? Number(props.sx?.borderRadius ?? Math.min(width, height) / 2)
  const action = props.onClick ?? props.action ?? (() => {})
  const iconSrc = props.iconSrc ?? props.startIcon ?? props.endIcon
  const iconPosition = props.iconPosition ?? (props.endIcon !== undefined && props.startIcon === undefined ? "end" : "start")
  const key = `component-button:${x}:${y}:${width}:${height}:${label}`
  const state = props.disabled === true ? "disabled" : host.hitState(x, y, width, height, key).pressed ? "active" : host.hitState(x, y, width, height, key).hovered ? "hover" : "idle"
  const textColor = buttonTextColor(tone)
  const style: StyleProps = {
    ...props.sx,
    fontSize: fontPx,
    borderRadius: radius,
  }

  if (variant === "text") {
    style.background = props.fill ?? palette.transparent
    style.borderColor = props.border ?? palette.transparent
    style.color = textColor
  } else if (variant === "outlined") {
    const border = props.border ?? toneBorder(tone)
    style.background = props.fill ?? outlinedFill(border, state)
    style.borderColor = props.border ?? stateBorder(border, state)
    style.color = textColor
  } else if (variant === "contained") {
    const fill = props.fill ?? toneFill(tone)
    const border = props.border ?? toneBorder(tone)
    style.background = props.fill ?? stateFill(fill, border, state)
    style.borderColor = props.border ?? stateBorder(border, state)
    style.color = textColor
  } else {
    if (props.fill !== undefined) style.background = stateFill(props.fill, props.border ?? toneBorder(tone), state)
    if (props.border !== undefined) style.borderColor = stateBorder(props.border, state)
    style.color = textColor
  }

  const elementProps: HtmlElementProps = {
    key,
    children: () => drawButtonContent(host, x, y, width, height, label, textColor, variant, state, props, iconSrc, iconPosition),
    onClick: action,
    style,
  }
  if (props.disabled !== undefined) elementProps.disabled = props.disabled
  if (props.tooltip !== undefined) elementProps.title = props.tooltip
  if (props.onHover !== undefined) elementProps.onPointerEnter = props.onHover
  if (props.onLeave !== undefined) elementProps.onPointerLeave = props.onLeave
  if (props.onPress !== undefined) elementProps.onPointerDown = props.onPress
  if (props.onRelease !== undefined) elementProps.onPointerUp = props.onRelease
  elementButton(host, x, y, width, height, elementProps)
}

export {autoButtonWidth}

function toneFromColor(color: ButtonColor): Tone {
  if (color === "success") return "live"
  if (color === "warning") return "paused"
  if (color === "error") return "warn"
  return "neutral"
}

function buttonTextColor(tone: Tone): `rgba(${string})` {
  if (tone === "live") return colorToRgba(palette.green)
  if (tone === "paused") return colorToRgba(palette.orange)
  if (tone === "warn") return colorToRgba(palette.red)
  return colorToRgba(palette.cyan)
}

function colorToRgba(color: Color): `rgba(${string})` {
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${roundAlpha(color.a)})`
}

function roundAlpha(value: number): number {
  return Math.round(value * 1000) / 1000
}

function outlinedFill(border: Color, state: ButtonVisualState): Color {
  if (state === "disabled") return withAlpha(palette.bgPanelDim, 0.50)
  if (state === "active") return withAlpha(mixColor(palette.bgHot, border, 0.34), 0.62)
  if (state === "hover") return withAlpha(mixColor(palette.bgHot, border, 0.22), 0.48)
  return palette.transparent
}

function stateFill(fill: Color, border: Color, state: ButtonVisualState): Color {
  if (state === "disabled") return withAlpha(palette.bgPanelDim, 0.62)
  if (state === "active") return withAlpha(mixColor(fill, border, 0.42), 0.98)
  if (state === "hover") return withAlpha(mixColor(fill, border, 0.28), 0.94)
  return fill
}

function stateBorder(border: Color, state: ButtonVisualState): Color {
  if (state === "disabled") return withAlpha(palette.borderDim, 0.62)
  if (state === "active") return withAlpha(mixColor(border, palette.text, 0.50), 1)
  if (state === "hover") return withAlpha(mixColor(border, palette.text, 0.34), 1)
  return border
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
  return new Color(color.r, color.g, color.b, alpha)
}

const buttonTextMaterialCache = new Map<string, TextMaterial>()

function buttonTextMaterial(color: `rgba(${string})`): TextMaterial {
  let material = buttonTextMaterialCache.get(color)
  if (material === undefined) {
    material = new TextMaterial({color: new Color(color)})
    buttonTextMaterialCache.set(color, material)
  }
  return material
}

function drawButtonContent(
  host: Card,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  textColor: `rgba(${string})`,
  variant: ButtonVariant,
  state: ButtonVisualState,
  props: ButtonProps,
  iconSrc: string | undefined,
  iconPosition: "start" | "end",
): void {
  const fontPx = props.fontPx ?? (props.size === "small" ? 10 : props.size === "large" ? 14 : 12)
  const pressOffsetY = state === "active" ? 1 : 0
  const disabled = state === "disabled"
  const material = disabled ? host.materials.muted : props.textMaterial ?? buttonTextMaterial(textColor)

  if (variant === "text" && !disabled && state !== "idle") {
    const hoverW = width - 8
    const hoverH = Math.max(16, Math.min(22, fontPx + 8, height - 6))
    host.drawRoundedRect(x + (width - hoverW) / 2, y + (height - hoverH) / 2 + pressOffsetY, hoverW, hoverH, {
      radius: Math.min(props.radius ?? hoverH / 2, hoverH / 2),
      fill: palette.bgHot,
      border: null,
      opacity: state === "active" ? 0.62 : 0.46,
      z: Z.ELEMENT + 0.00001,
    })
  }

  if (iconSrc === undefined || iconSrc.length === 0) {
    host.drawTextCentered(label, x + width / 2, y + pressOffsetY + height / 2, {
      fontPx,
      material,
      maxWidthPx: width - 6,
      z: Z.TEXT,
    })
    return
  }

  const iconSize = Math.min(props.iconSizePx ?? Math.max(14, height - 12), Math.max(1, height - 8), Math.max(1, width - 8))
  const showLabel = props.iconOnly !== true && label.length > 0
  const labelW = showLabel ? host.measureText(label, fontPx) : 0
  const gap = showLabel ? 7 : 0
  const contentW = Math.min(width - 8, iconSize + gap + labelW)
  let cx = x + (width - contentW) / 2
  const iconY = y + pressOffsetY + (height - iconSize) / 2
  const textY = y + pressOffsetY + (height - fontPx) / 2
  const iconOpacity = disabled ? 0.36 : 0.95

  if (iconPosition === "end" && showLabel) {
    const available = Math.max(1, width - iconSize - gap - 10)
    host.drawText(label, cx, textY, {fontPx, material, maxWidthPx: available, z: Z.TEXT})
    host.drawImage(iconSrc, cx + Math.min(labelW, available) + gap, iconY, iconSize, iconSize, {
      fit: "contain",
      opacity: iconOpacity,
      z: Z.TEXT,
    })
    return
  }

  host.drawImage(iconSrc, cx, iconY, iconSize, iconSize, {
    fit: "contain",
    opacity: iconOpacity,
    z: Z.TEXT,
  })
  cx += iconSize + gap
  if (showLabel) {
    const available = Math.max(1, x + width - 5 - cx)
    host.drawText(label, cx, textY, {fontPx, material, maxWidthPx: available, z: Z.TEXT})
  }
}
