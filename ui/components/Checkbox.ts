import {Color} from "@metafor/engine"
import {
  button,
  drawIconCentered,
  palette,
  radii,
  uiIcons,
  Z,
  type ButtonElementProps,
  type ButtonElementState,
  type StyleProps,
  type Tone,
  type UiSurface,
} from "@ui/elements"

export type CheckboxSize = "small" | "medium" | "large"

export type CheckboxProps = {
  checked?: boolean
  value?: boolean
  disabled?: boolean
  label?: string
  key?: string
  size?: CheckboxSize
  tone?: Tone
  tooltip?: string
  tooltipDelayMs?: number
  sx?: StyleProps
  onChange?: (checked: boolean) => void
  onClick?: (checked: boolean) => void
}

export function Checkbox(host: UiSurface, x: number, y: number, width: number, height: number, props: CheckboxProps = {}): void {
  const checked = props.checked ?? props.value ?? false
  const disabled = props.disabled === true
  const size = checkboxSize(width, height, props.size)
  const boxX = x + Math.max(0, (width - size) / 2)
  const boxY = y + Math.max(0, (height - size) / 2)
  const key = props.key ?? `component-checkbox:${x}:${y}:${width}:${height}`
  const elementProps: ButtonElementProps = {
    key,
    children: (state) => drawCheckbox(host, boxX, boxY, size, checked, disabled ? "disabled" : state, props),
    onClick: () => {
      const next = !checked
      props.onChange?.(next)
      props.onClick?.(next)
    },
    style: {
      background: null,
      borderColor: null,
      borderRadius: props.sx?.borderRadius ?? radii.control,
      padding: 0,
      zIndex: props.sx?.zIndex ?? Z.ELEMENT,
    },
  }
  if (disabled) elementProps.disabled = true
  if (props.tooltip !== undefined) elementProps.tooltip = props.tooltip
  if (props.tooltipDelayMs !== undefined) elementProps.tooltipDelayMs = props.tooltipDelayMs
  button(host, x, y, width, height, elementProps)
}

function drawCheckbox(
  host: UiSurface,
  x: number,
  y: number,
  size: number,
  checked: boolean,
  state: ButtonElementState,
  props: CheckboxProps,
): void {
  const disabled = state === "disabled"
  const hover = state === "hover"
  const active = state === "active"
  const tone = props.tone ?? "neutral"
  const accent = tone === "live" ? palette.green : tone === "paused" ? palette.orange : tone === "warn" ? palette.red : palette.cyan
  const baseFill = checked
    ? withAlpha(mixColor(palette.bgHot, accent, active ? 0.38 : hover ? 0.30 : 0.24), disabled ? 0.34 : 0.86)
    : active
      ? withAlpha(palette.bgHot, 0.66)
      : hover
        ? withAlpha(palette.bgHot, 0.48)
        : withAlpha(palette.bgInput, 0.82)
  const border = disabled
    ? withAlpha(palette.borderDim, 0.55)
    : checked
      ? withAlpha(accent, active ? 0.92 : 0.78)
      : hover || active
        ? palette.border
        : palette.borderDim

  host.drawRoundedRect(x, y, size, size, {
    radius: Math.max(3, Math.min(6, size * 0.24)),
    fill: baseFill,
    border,
    borderWidth: 1,
    opacity: disabled ? 0.62 : 1,
    z: numericStyleValue(props.sx?.zIndex) ?? Z.ELEMENT,
  })

  if (!checked) return
  drawIconCentered(host, uiIcons.apply, x + size / 2, y + size / 2, Math.max(10, size * 0.72), {
    opacity: disabled ? 0.42 : 0.95,
    z: (numericStyleValue(props.sx?.zIndex) ?? Z.ELEMENT) + 0.04,
  })
}

function checkboxSize(width: number, height: number, size: CheckboxSize | undefined): number {
  const max = Math.max(1, Math.min(width, height))
  if (size === "small") return Math.min(max, 14)
  if (size === "large") return Math.min(max, 22)
  return Math.min(max, 18)
}

function numericStyleValue(value: StyleProps[keyof StyleProps] | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
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
