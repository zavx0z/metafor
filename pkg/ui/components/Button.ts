import {autoButtonWidth} from "./internal/renderers.ts"
import {Z} from "@ui/elements"
import {
  blenderRgba8ToColor,
  button as elementButton,
  cssColor,
  drawIconCentered,
  flexRow,
  textMaterial,
  type ButtonElementAppearance,
  type ButtonElementLayout,
  type ButtonElementProps,
  type GroupedCellAppearance,
  type UiSurface,
  type StyleProps,
} from "@ui/elements"
import type {Tone} from "@ui/elements"
import type {Color, TextMaterial} from "@metafor/engine"

export type ButtonVariant = "text" | "outlined" | "contained" | "glass"
export type ButtonColor = "primary" | "neutral" | "success" | "warning" | "error"
export type ButtonSize = "small" | "medium" | "large"
export type ButtonAppearance = ButtonElementAppearance

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
  focused?: boolean
  appearance?: ButtonAppearance
  groupedCell?: GroupedCellAppearance
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
  const action = props.onClick ?? props.action ?? (() => {})
  const iconSrc = props.iconSrc ?? props.startIcon ?? props.endIcon
  const iconPosition = props.iconPosition ?? (props.endIcon !== undefined && props.startIcon === undefined ? "end" : "start")
  const key = `component-button:${x}:${y}:${width}:${height}:${label}`
  const appearance = componentButtonAppearance(props)

  const elementProps: ButtonElementProps = {
    key,
    children: iconSrc === undefined && props.textMaterial === undefined
      ? label
      : (_state, layout) => drawButtonContent(host, label, layout, props, iconSrc, iconPosition),
    onClick: action,
    style: buttonStyle(props),
    appearance,
    selected: props.selected === true,
    focused: props.focused === true,
  }
  if (props.size !== undefined) elementProps.size = props.size
  if (props.groupedCell !== undefined) elementProps.groupedCell = props.groupedCell
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
    appearance: props.appearance ?? "tool",
    iconOnly: true,
    tooltip: props.tooltip ?? props.label,
  })
}

export {autoButtonWidth}

function buttonStyle(props: ButtonProps): StyleProps {
  const style: StyleProps = {...props.sx}
  if (props.fontPx !== undefined) style.fontSize = props.fontPx
  if (props.radius !== undefined) style.borderRadius = props.radius
  if (props.fill !== undefined) style.background = props.fill
  if (props.border !== undefined) style.borderColor = props.border
  return style
}

function componentButtonAppearance(props: ButtonProps): ButtonElementAppearance {
  if (props.appearance !== undefined) return props.appearance
  if (props.iconOnly === true) return "tool"
  if (props.selected === true) return "toggle"
  return "button"
}

function drawButtonContent(
  host: UiSurface,
  label: string,
  layout: ButtonElementLayout,
  props: ButtonProps,
  iconSrc: string | undefined,
  iconPosition: "start" | "end",
): void {
  const fontPx = props.fontPx ?? layout.fontPx
  const contentColor = props.sx?.color ?? blenderRgba8ToColor(layout.colors.text)
  const material = props.textMaterial ?? textMaterial(host, contentColor)
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
  const iconOpacity = 1
  const iconItem = {
    width: iconSize,
    height: iconSize,
    draw: (x: number, y: number, width: number, height: number) => drawIconCentered(host, iconSrc ?? "", x + width / 2, y + height / 2, iconSize, {
      opacity: iconOpacity,
      tint: props.sx?.color === undefined ? blenderRgba8ToColor(layout.colors.item) : cssColor(props.sx.color),
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
