import {flexRow, palette, uiIcons, uiShapeMetrics, type UiSurface} from "@ui/elements"
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
  const disabled = props.disabled === true || props.readOnly === true
  const showClear = props.value !== null && props.onClear !== undefined
  const gap = uiShapeMetrics.tightGap
  const clearWidth = showClear ? uiShapeMetrics.iconActionSlot : 0
  const mainProps: ButtonProps = {
    children: props.value?.label ?? props.placeholder ?? "Не выбрано",
    variant: "contained",
    fill: palette.bgInput,
    border: palette.borderDim,
    disabled,
    action: () => props.onActivate?.(),
  }
  const tooltip = props.value?.kind ?? props.tooltip
  if (tooltip !== undefined) mainProps.tooltip = tooltip

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
            variant: "contained",
            fill: palette.bgInput,
            border: palette.borderDim,
            disabled,
            action: () => props.onClear?.(),
          }
          IconButton(host, slotX, slotY, slotW, slotH, clearProps)
        },
      }] : []),
    ],
  })
}
