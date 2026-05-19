import {button as renderButton, autoButtonWidth, type ButtonOpts as RenderButtonOpts} from "./internal/renderers.ts"
import {palette, toneBorder, toneFill, type Card, type StyleProps} from "@metafor/elements"
import type {Tone} from "@metafor/elements"
import type {Color, TextMaterial} from "@metafor/engine"

export type ButtonVariant = "text" | "outlined" | "contained" | "glass"
export type ButtonColor = "primary" | "neutral" | "success" | "warning" | "error"
export type ButtonSize = "small" | "medium" | "large"

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
  const opts: RenderButtonOpts = {
    label,
    tone,
    fontPx,
    radius: props.radius ?? Number(props.sx?.borderRadius ?? Math.min(width, height) / 2),
    action: props.onClick ?? props.action ?? (() => {}),
  }
  const variant = props.variant ?? "glass"
  if (variant === "text") {
    opts.fill = props.fill ?? palette.transparent
    opts.border = props.border ?? palette.transparent
  } else if (variant === "outlined") {
    opts.fill = props.fill ?? palette.transparent
    opts.border = props.border ?? toneBorder(tone)
  } else if (variant === "contained") {
    opts.fill = props.fill ?? toneFill(tone)
    opts.border = props.border ?? toneBorder(tone)
  }
  if (props.disabled !== undefined) opts.disabled = props.disabled
  const iconSrc = props.iconSrc ?? props.startIcon ?? props.endIcon
  if (iconSrc !== undefined) opts.iconSrc = iconSrc
  if (props.iconOnly !== undefined) opts.iconOnly = props.iconOnly
  if (props.iconSizePx !== undefined) opts.iconSizePx = props.iconSizePx
  if (props.tooltip !== undefined) opts.tooltip = props.tooltip
  if (props.tooltipDelayMs !== undefined) opts.tooltipDelayMs = props.tooltipDelayMs
  if (props.fill !== undefined) opts.fill = props.fill
  if (props.border !== undefined) opts.border = props.border
  if (props.textMaterial !== undefined) opts.textMaterial = props.textMaterial
  if (props.onHover !== undefined) opts.onHover = props.onHover
  if (props.onLeave !== undefined) opts.onLeave = props.onLeave
  if (props.onPress !== undefined) opts.onPress = props.onPress
  if (props.onRelease !== undefined) opts.onRelease = props.onRelease
  renderButton(host, x, y, width, height, opts)
}

export {autoButtonWidth}

function toneFromColor(color: ButtonColor): Tone {
  if (color === "success") return "live"
  if (color === "warning") return "paused"
  if (color === "error") return "warn"
  return "neutral"
}
