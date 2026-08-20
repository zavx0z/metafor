import {flexRow, uiIcons, uiShapeMetrics, type UiSurface} from "@ui/elements"
import {IconButton, type IconButtonProps} from "./Button.ts"
import {ControlGroup} from "./ControlGroup.ts"
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
  const showBrowse = props.onBrowse !== undefined
  const browseWidth = uiShapeMetrics.iconActionSlot
  const textFieldProps: Parameters<typeof TextField>[5] = {
    value: props.value,
    disabled,
  }
  if (props.key !== undefined) textFieldProps.key = props.key
  if (props.placeholder !== undefined) textFieldProps.placeholder = props.placeholder
  if (!disabled && props.onChange !== undefined) textFieldProps.onChange = (value) => props.onChange!(value)

  ControlGroup(host, x, y, width, height, {
    columns: showBrowse ? ["grow", browseWidth] : 1,
    children(group) {
      flexRow({
        x,
        y,
        w: width,
        h: height,
        gap: 0,
        alignItems: "stretch",
        items: [
          {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => {
            TextField(host, slotX, slotY, slotW, slotH, {
              ...textFieldProps,
              appearance: group.cell(0, 0).inputAppearance,
              sx: group.cellStyle,
            })
          }},
          showBrowse && {width: browseWidth, height, draw: (slotX, slotY, slotW, slotH) => {
            const browseProps: IconButtonProps = {
              label: "Выбрать путь",
              iconSrc: uiIcons.folder,
              disabled,
              action: props.onBrowse!,
              sx: group.cellStyle,
            }
            IconButton(host, slotX, slotY, slotW, slotH, browseProps)
          }},
        ],
      })
    },
  })
}
