import {flexRow, uiIcons, uiShapeMetrics, type UiSurface} from "@ui/elements"
import {Button, IconButton, type ButtonProps} from "./Button.ts"
import {ControlGroup, type ControlGroupTrack} from "./ControlGroup.ts"

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
  onPick?(): void
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
  const showPicker = props.onPick !== undefined
  const showClear = props.value !== null && props.onClear !== undefined
  const pickerWidth = uiShapeMetrics.iconActionSlot
  const clearWidth = showClear ? uiShapeMetrics.iconActionSlot : 0
  const actionTracks: ControlGroupTrack[] = ["grow"]
  if (showPicker) actionTracks.push(pickerWidth)
  if (showClear) actionTracks.push(clearWidth)
  const mainProps: ButtonProps = {
    children: props.value?.label ?? props.placeholder ?? "Не выбрано",
    startIcon: uiIcons.resource,
    disabled: disabled || props.onActivate === undefined,
    action: props.onActivate ?? (() => {}),
  }
  const tooltip = props.value?.kind ?? props.tooltip
  if (tooltip !== undefined) mainProps.tooltip = tooltip

  ControlGroup(host, x, y, width, height, {
    appearance: "pointer",
    columns: actionTracks,
    children(group) {
      let column = 1
      flexRow({
        x,
        y,
        w: width,
        h: height,
        gap: 0,
        alignItems: "stretch",
        items: [
          {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => {
            Button(host, slotX, slotY, slotW, slotH, {
              ...mainProps,
              sx: group.cellStyle,
              appearance: group.buttonAppearance,
              groupedCell: group.cell(0, 0).groupedCell,
            })
          }},
          showPicker && {width: pickerWidth, height, draw: (slotX, slotY, slotW, slotH) => {
            const cell = column++
            IconButton(host, slotX, slotY, slotW, slotH, {
              label: "Выбрать ресурс",
              iconSrc: uiIcons.picker,
              disabled,
              action: props.onPick!,
              sx: group.cell(0, cell).cellStyle,
              appearance: group.buttonAppearance,
              groupedCell: group.cell(0, cell).groupedCell,
            })
          }},
          showClear && {width: clearWidth, height, draw: (slotX, slotY, slotW, slotH) => {
            const cell = column++
            IconButton(host, slotX, slotY, slotW, slotH, {
              label: "Очистить ссылку",
              iconSrc: uiIcons.close,
              disabled,
              action: props.onClear!,
              sx: group.cell(0, cell).cellStyle,
              appearance: group.buttonAppearance,
              groupedCell: group.cell(0, cell).groupedCell,
            })
          }},
        ],
      })
    },
  })
}
