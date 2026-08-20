import {flexRow, palette, uiIcons, type UiSurface} from "@ui/elements"
import {Button, IconButton, type ButtonProps} from "./Button.ts"

export type ReferenceInputValue = Readonly<{
  id: string
  label: string
  kind?: string
}>

export type ReferenceInputDensity = "regular" | "compact"

export type ReferenceInputProps = {
  value: ReferenceInputValue | null
  placeholder?: string
  tooltip?: string
  disabled?: boolean
  readOnly?: boolean
  density?: ReferenceInputDensity
  onActivate?(): void
  onClear?(): void
}

/** Draws one controlled opaque reference with separate browse and clear actions. */
export function ReferenceInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: ReferenceInputProps,
): void {
  const compact = props.density === "compact"
  const disabled = props.disabled === true || props.readOnly === true
  const showClear = props.value !== null && props.onClear !== undefined
  const gap = compact ? 3 : 7
  const radius = compact ? 3 : Math.min(width, height) / 2
  const clearWidth = showClear ? height : 0
  const mainProps: ButtonProps = {
    children: props.value?.label ?? props.placeholder ?? "Не выбрано",
    variant: compact ? "contained" : "outlined",
    radius,
    fontPx: compact ? 11 : 12,
    disabled,
    action: () => props.onActivate?.(),
  }
  const tooltip = props.value?.kind ?? props.tooltip
  if (tooltip !== undefined) mainProps.tooltip = tooltip
  if (compact) {
    mainProps.fill = palette.bgInput
    mainProps.border = palette.borderDim
  }

  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: showClear ? gap : 0,
    alignItems: "stretch",
    items: [
      {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => {
        Button(host, slotX, slotY, slotW, slotH, mainProps)
      }},
      ...(showClear ? [{
        width: clearWidth,
        height,
        draw: (slotX: number, slotY: number, slotW: number, slotH: number) => {
          const clearProps: Parameters<typeof IconButton>[5] = {
            label: "Очистить ссылку",
            iconSrc: uiIcons.close,
            variant: compact ? "contained" : "outlined",
            radius: compact ? 3 : height / 2,
            iconSizePx: compact ? 14 : 16,
            disabled,
            action: () => props.onClear?.(),
          }
          if (compact) {
            clearProps.fill = palette.bgInput
            clearProps.border = palette.borderDim
          }
          IconButton(host, slotX, slotY, slotW, slotH, clearProps)
        },
      }] : []),
    ],
  })
}
