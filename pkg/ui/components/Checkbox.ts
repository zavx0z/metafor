import {
  backgroundColor,
  blenderRgba8ToColor,
  button,
  cssColor,
  drawIconCentered,
  resolveWidgetColors,
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
      borderRadius: 0,
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
  const colors = resolveWidgetColors("option", {
    hovered: hover,
    pressed: active,
    selected: checked,
    disabled,
  })
  const explicitFill = props.sx?.background !== undefined || props.sx?.backgroundColor !== undefined
    ? backgroundColor(props.sx)
    : undefined
  const explicitBorder = props.sx?.borderColor === undefined
    ? undefined
    : props.sx.borderColor === null
      ? null
      : cssColor(props.sx.borderColor)

  host.drawRoundedRect(x, y, size, size, {
    radius: numericStyleValue(props.sx?.borderRadius) ?? size * 0.2,
    fill: explicitFill === undefined ? blenderRgba8ToColor(colors.inner) : explicitFill,
    border: explicitBorder === undefined ? blenderRgba8ToColor(colors.outline) : explicitBorder,
    borderWidth: numericStyleValue(props.sx?.borderWidth) ?? 1,
    opacity: numericStyleValue(props.sx?.opacity) ?? 1,
    z: numericStyleValue(props.sx?.zIndex) ?? Z.ELEMENT,
  })

  if (!checked) return
  drawIconCentered(host, uiIcons.apply, x + size / 2, y + size / 2, Math.max(10, size * 0.72), {
    opacity: 1,
    tint: blenderRgba8ToColor(colors.item),
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
