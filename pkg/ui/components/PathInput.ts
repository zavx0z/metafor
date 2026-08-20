import {flexRow, palette, type StyleProps, type UiSurface} from "@ui/elements"
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

const COMPACT_STYLE: StyleProps = {
  borderWidth: 1,
  borderRadius: 3,
  color: "#E6E6E6",
  fontSize: 11,
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
  const compact = props.density === "compact"
  const disabled = props.disabled === true || props.readOnly === true
  const gap = compact ? 3 : 7
  const browseWidth = height
  const textFieldProps: Parameters<typeof TextField>[5] = {
    value: props.value,
    disabled,
  }
  if (props.key !== undefined) textFieldProps.key = props.key
  if (props.placeholder !== undefined) textFieldProps.placeholder = props.placeholder
  if (compact) {
    textFieldProps.fontPx = 11
    textFieldProps.sx = COMPACT_STYLE
  }
  if (!disabled && props.onChange !== undefined) textFieldProps.onChange = (value) => props.onChange!(value)

  const browseProps: ButtonProps = {
    children: "…",
    tooltip: "Выбрать путь",
    color: "neutral",
    variant: compact ? "contained" : "outlined",
    radius: compact ? 3 : height / 2,
    fontPx: compact ? 11 : 12,
    disabled,
    action: () => props.onBrowse?.(),
  }
  if (compact) {
    browseProps.fill = palette.bgInput
    browseProps.border = palette.borderDim
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
