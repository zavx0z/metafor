import {button, type StyleProps, type Tone, type UiSurface} from "@ui/elements"

export type SwitcherColor = "primary" | "neutral" | "success" | "warning" | "error"
export type SwitcherSize = "small" | "medium" | "large"

export type SwitcherProps = {
  checked?: boolean
  value?: boolean
  disabled?: boolean
  color?: SwitcherColor
  tone?: Tone
  size?: SwitcherSize
  key?: string
  tooltip?: string
  tooltipDelayMs?: number
  sx?: StyleProps
  onChange?: (checked: boolean) => void
  onClick?: (checked: boolean) => void
}

/** Compatibility boolean control rendered as a rectangular Blender toggle. */
export function Switcher(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: SwitcherProps = {},
): void {
  const checked = props.checked ?? props.value ?? false
  const elementProps: NonNullable<Parameters<typeof button>[5]> = {
    key: props.key ?? `component-switcher:${x}:${y}:${width}:${height}`,
    appearance: "toggle",
    selected: checked,
    onClick: () => {
      const next = !checked
      props.onChange?.(next)
      props.onClick?.(next)
    },
  }
  if (props.sx !== undefined) elementProps.style = props.sx
  if (props.disabled !== undefined) elementProps.disabled = props.disabled
  if (props.tooltip !== undefined) elementProps.tooltip = props.tooltip
  if (props.tooltipDelayMs !== undefined) elementProps.tooltipDelayMs = props.tooltipDelayMs
  button(host, x, y, width, height, elementProps)
}
