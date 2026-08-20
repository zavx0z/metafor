import {flexRow, palette, type UiSurface} from "@ui/elements"
import {Button, type ButtonProps} from "./Button.ts"

export type EnumInputOption = Readonly<{
  value: string
  label: string
  description?: string
}>

export type EnumInputDensity = "regular" | "compact"
export type EnumInputPresentation = "cycle" | "expanded"
export type EnumInputState = "ready" | "undefined" | "error"

export type EnumInputProps = {
  value: string
  options?: readonly EnumInputOption[]
  presentation?: EnumInputPresentation
  state?: EnumInputState
  tooltip?: string
  disabled?: boolean
  readOnly?: boolean
  density?: EnumInputDensity
  onChange?(value: string): void
}

/** Returns the exact immutable option selected by a stable controlled value. */
export function findEnumInputOption(
  value: string,
  options: readonly EnumInputOption[],
): EnumInputOption | undefined {
  return options.find((option) => option.value === value)
}

/** Cycles stable option values while preserving the established invalid-value behavior. */
export function nextEnumInputValue(
  value: string,
  options: readonly EnumInputOption[],
  step = 1,
): string {
  if (options.length === 0) return value
  const current = options.findIndex((option) => option.value === value)
  const start = current < 0 ? 0 : current
  const index = ((start + step) % options.length + options.length) % options.length
  return options[index]!.value
}

/** Draws a controlled stable enum as a cycle button or inline expanded choices. */
export function EnumInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: EnumInputProps,
): void {
  const exceptionalLabel = enumInputExceptionalLabel(props)
  if (exceptionalLabel !== undefined) {
    Button(host, x, y, width, height, enumButtonProps(props, exceptionalLabel, true))
    return
  }

  const options = props.options!
  if (props.presentation === "expanded") {
    drawExpandedEnumInput(host, x, y, width, height, props, options)
    return
  }

  const selected = findEnumInputOption(props.value, options)
  const disabled = enumInputDisabled(props)
  const buttonProps = enumButtonProps(props, selected?.label ?? props.value, disabled)
  const tooltip = selected?.description ?? props.tooltip
  if (tooltip !== undefined) buttonProps.tooltip = tooltip
  if (!disabled && props.onChange !== undefined) {
    buttonProps.action = () => props.onChange!(nextEnumInputValue(props.value, options))
  }
  Button(host, x, y, width, height, buttonProps)
}

function drawExpandedEnumInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: EnumInputProps,
  options: readonly EnumInputOption[],
): void {
  const disabled = enumInputDisabled(props)
  const compact = props.density === "compact"
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: compact ? 3 : 4,
    alignItems: "stretch",
    items: options.map((option) => ({
      width: "1fr" as const,
      height,
      draw: (slotX: number, slotY: number, slotW: number, slotH: number) => {
        const selected = option.value === props.value
        const buttonProps = enumButtonProps(props, option.label, disabled, selected)
        const tooltip = option.description ?? (selected ? props.tooltip : undefined)
        if (tooltip !== undefined) buttonProps.tooltip = tooltip
        if (!disabled && props.onChange !== undefined) {
          buttonProps.action = () => props.onChange!(option.value)
        }
        Button(host, slotX, slotY, slotW, slotH, buttonProps)
      },
    })),
  })
}

function enumInputExceptionalLabel(props: EnumInputProps): string | undefined {
  if (props.state === "error") return "Menu Error"
  if (props.state === "undefined" || props.options === undefined) return "Menu Undefined"
  if (props.options.length === 0) return "No Items"
  return undefined
}

function enumInputDisabled(props: EnumInputProps): boolean {
  return props.disabled === true || props.readOnly === true
}

function enumButtonProps(
  props: EnumInputProps,
  label: string,
  disabled: boolean,
  selected = false,
): ButtonProps {
  const compact = props.density === "compact"
  const buttonProps: ButtonProps = {
    children: label,
    variant: selected || compact ? "contained" : "outlined",
    fontPx: compact ? 11 : 12,
    disabled,
    selected,
  }
  if (compact) {
    buttonProps.radius = 3
    buttonProps.fill = selected ? palette.bgHot : palette.bgInput
    buttonProps.border = selected ? palette.border : palette.borderDim
  }
  return buttonProps
}
