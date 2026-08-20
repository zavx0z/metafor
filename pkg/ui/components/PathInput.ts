import {flexRow, palette, uiShapeMetrics, type UiSurface} from "@ui/elements"
import {Button, type ButtonProps} from "./Button.ts"
import {TextField} from "./TextField.ts"

export type PathInputDensity = "regular" | "compact"

export type PathInputProps = {
  key?: string
  value: string
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  density?: PathInputDensity
  onChange?(value: string): void
  onBrowse?(): void
}

/** Draws one controlled path string with a separate owner-provided browse action. */
export function PathInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: PathInputProps,
): void {
  const disabled = props.disabled === true || props.readOnly === true
  const gap = uiShapeMetrics.tightGap
  const browseWidth = uiShapeMetrics.iconActionSlot
  const textFieldProps: Parameters<typeof TextField>[5] = {
    value: props.value,
    disabled,
  }
  if (props.key !== undefined) textFieldProps.key = props.key
  if (props.placeholder !== undefined) textFieldProps.placeholder = props.placeholder
  if (!disabled && props.onChange !== undefined) textFieldProps.onChange = (value) => props.onChange!(value)

  const browseProps: ButtonProps = {
    children: "…",
    tooltip: "Выбрать путь",
    color: "neutral",
    variant: "contained",
    fill: palette.bgInput,
    border: palette.borderDim,
    disabled,
    action: () => props.onBrowse?.(),
  }

  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap,
    alignItems: "stretch",
    items: [
      {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => {
        TextField(host, slotX, slotY, slotW, slotH, textFieldProps)
      }},
      {width: browseWidth, height, draw: (slotX, slotY, slotW, slotH) => {
        Button(host, slotX, slotY, slotW, slotH, browseProps)
      }},
    ],
  })
}
