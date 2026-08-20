import {autoButtonWidth} from "./internal/renderers.ts"
import {Z} from "@ui/elements"
import {button as elementButton, drawIconCentered, flexRow, palette, toneBorder, toneFill, type ButtonElementLayout, type ButtonElementProps, type ButtonElementState, type UiSurface, type StyleProps} from "@ui/elements"
import type {Tone} from "@ui/elements"
import {Color, TextMaterial} from "@metafor/engine"

export type ButtonVariant = "text" | "outlined" | "contained" | "glass"
export type ButtonColor = "primary" | "neutral" | "success" | "warning" | "error"
export type ButtonSize = "small" | "medium" | "large"
type ButtonVisualState = ButtonElementState

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
  /** Persistent selected mode. A selected disabled button stays visually active without accepting input. */
  selected?: boolean
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

export type IconButtonProps = Omit<ButtonProps, "children" | "iconOnly" | "iconPosition" | "startIcon" | "endIcon"> & {
  label: string
  iconSrc: string
}

export function Button(host: UiSurface, x: number, y: number, width: number, height: number, props: ButtonProps): void {
  const label = props.label ?? props.children ?? ""
  const tone = props.tone ?? toneFromColor(props.color ?? "primary")
  const variant = props.variant ?? "glass"
  const action = props.onClick ?? props.action ?? (() => {})
  const iconSrc = props.iconSrc ?? props.startIcon ?? props.endIcon
  const iconPosition = props.iconPosition ?? (props.endIcon !== undefined && props.startIcon === undefined ? "end" : "start")
  const key = `component-button:${x}:${y}:${width}:${height}:${label}`
  const textColor = buttonTextColor(tone)

  const elementProps: ButtonElementProps = {
    key,
    children: iconSrc === undefined && props.textMaterial === undefined
      ? label
      : (state, layout) => drawButtonContent(host, label, textColor, state, layout, props, iconSrc, iconPosition),
    onClick: action,
    style: (state) => buttonStyleForState(state, variant, tone, textColor, props.fontPx, props.radius, props),
  }
  if (props.size !== undefined) elementProps.size = props.size
  if (props.disabled !== undefined) elementProps.disabled = props.disabled
  if (props.tooltip !== undefined) elementProps.tooltip = props.tooltip
  if (props.tooltipDelayMs !== undefined) elementProps.tooltipDelayMs = props.tooltipDelayMs
  if (props.onHover !== undefined) elementProps.onPointerEnter = props.onHover
  if (props.onLeave !== undefined) elementProps.onPointerLeave = props.onLeave
  if (props.onPress !== undefined) elementProps.onPointerDown = props.onPress
  if (props.onRelease !== undefined) elementProps.onPointerUp = props.onRelease
  elementButton(host, x, y, width, height, elementProps)
}

export function IconButton(host: UiSurface, x: number, y: number, width: number, height: number, props: IconButtonProps): void {
  Button(host, x, y, width, height, {
    ...props,
    variant: props.variant ?? "text",
    iconOnly: true,
    tooltip: props.tooltip ?? props.label,
  })
}

export {autoButtonWidth}

function buttonStyleForState(
  state: ButtonVisualState,
  variant: ButtonVariant,
  tone: Tone,
  textColor: `rgba(${string})`,
  fontPx: number | undefined,
  radius: number | undefined,
  props: ButtonProps,
): StyleProps {
  const visualState = props.selected === true && state === "disabled" ? "idle" : state
  const style: StyleProps = {
    ...props.sx,
  }
  if (fontPx !== undefined) style.fontSize = fontPx
  if (radius !== undefined) style.borderRadius = radius

  if (variant === "text") {
    style.background = props.fill ?? textFill(visualState)
    style.borderColor = props.border ?? null
    style.color = textColor
  } else if (variant === "outlined") {
    const border = props.border ?? toneBorder(tone)
    style.background = props.fill ?? outlinedFill(border, visualState)
    style.borderColor = props.border ?? stateBorder(border, visualState)
    style.color = textColor
  } else if (variant === "contained") {
    const fill = props.fill ?? toneFill(tone)
    const border = props.border ?? toneBorder(tone)
    style.background = props.fill ?? stateFill(fill, border, visualState)
    style.borderColor = props.border ?? stateBorder(border, visualState)
    style.color = textColor
  } else {
    if (props.fill !== undefined) style.background = stateFill(props.fill, props.border ?? toneBorder(tone), visualState)
    if (props.border !== undefined) style.borderColor = stateBorder(props.border, visualState)
    style.color = textColor
  }

  return style
}

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

function textFill(state: ButtonVisualState): Color | null {
  if (state === "active") return withAlpha(palette.bgHot, 0.62)
  if (state === "hover") return withAlpha(palette.bgHot, 0.46)
  return null
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
  host: UiSurface,
  label: string,
  textColor: `rgba(${string})`,
  state: ButtonVisualState,
  layout: ButtonElementLayout,
  props: ButtonProps,
  iconSrc: string | undefined,
  iconPosition: "start" | "end",
): void {
  const fontPx = props.fontPx ?? layout.fontPx
  const disabled = state === "disabled" && props.selected !== true
  const material = disabled ? host.materials.muted : props.textMaterial ?? buttonTextMaterial(textColor)
  const content = layout.content
  if (iconSrc === undefined || iconSrc.length === 0) {
    host.drawTextCentered(label, content.x + content.width / 2, content.y + content.height / 2, {
      fontPx,
      material,
      maxWidthPx: Math.max(1, content.width),
      z: Z.TEXT,
    })
    return
  }
  const iconSize = Math.min(props.iconSizePx ?? layout.iconPx, Math.max(1, content.height), Math.max(1, content.width))
  const showLabel = props.iconOnly !== true && label.length > 0
  const labelW = showLabel ? host.measureText(label, fontPx) : 0
  const gap = showLabel ? layout.gap : 0
  const labelSlotW = Math.max(0, Math.min(labelW, content.width - iconSize - gap))
  const iconOpacity = disabled ? 0.36 : 0.95
  const iconItem = {
    width: iconSize,
    height: iconSize,
    draw: (x: number, y: number, width: number, height: number) => drawIconCentered(host, iconSrc ?? "", x + width / 2, y + height / 2, iconSize, {
      opacity: iconOpacity,
      z: Z.TEXT,
    }),
  }
  const labelItem = showLabel ? {
    width: labelSlotW,
    height: content.height,
    draw: (x: number, y: number, width: number, height: number) => host.drawTextCentered(label, x + width / 2, y + height / 2, {
      fontPx,
      material,
      maxWidthPx: Math.max(1, width),
      z: Z.TEXT,
    }),
  } : null
  flexRow({
    x: content.x,
    y: content.y,
    w: content.width,
    h: content.height,
    gap,
    alignItems: "center",
    justifyContent: "center",
    items: iconPosition === "end" ? [labelItem, iconItem] : [iconItem, labelItem],
  })
}
