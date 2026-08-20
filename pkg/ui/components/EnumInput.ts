import {
  blenderRgba8ToColor,
  drawIconCentered,
  flexRow,
  resolveWidgetColors,
  select,
  textMaterial,
  uiShapeMetrics,
  Z,
  type ButtonElementState,
  type SelectElementContentRect,
  type SelectElementProps,
  type UiSurface,
} from "@ui/elements"
import {Button, type ButtonProps} from "./Button.ts"

export type EnumInputOption = Readonly<{
  value: string
  label: string
  description?: string
  disabled?: boolean
  iconSrc?: string
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
  popupLabel?: string
  disabled?: boolean
  readOnly?: boolean
  density?: EnumInputDensity
  open?: boolean
  onChange?(value: string): void
  onOpenChange?(open: boolean): void
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
    select(host, x, y, width, height, {value: exceptionalLabel, disabled: true})
    return
  }

  const options = props.options!
  if (props.presentation === "expanded") {
    drawExpandedEnumInput(host, x, y, width, height, props, options)
    return
  }

  const selected = findEnumInputOption(props.value, options)
  const disabled = enumInputDisabled(props)
  const selectProps: SelectElementProps<string> = {
    value: props.value,
    options,
    disabled,
  }
  if (props.open !== undefined) selectProps.open = props.open
  if (props.onOpenChange !== undefined) selectProps.onOpenChange = props.onOpenChange
  if (props.popupLabel !== undefined) selectProps.popupLabel = props.popupLabel
  const hasOptionIcon = options.some((option) => option.iconSrc !== undefined)
  if (selected?.iconSrc !== undefined) {
    selectProps.renderTriggerContent = (context) => {
      const colors = resolveWidgetColors("menu", enumTriggerWidgetState(context.state))
      drawEnumContent(host, context.rect, context.label, selected.iconSrc, true, colors.text, colors.item)
    }
  }
  if (hasOptionIcon) {
    selectProps.renderOptionContent = (context) => {
      const colors = resolveWidgetColors("menuItem", {
        disabled: context.disabled,
        hovered: context.state.hovered || context.state.pressed,
        selectedDraw: context.selected,
      })
      const iconSrc = findEnumInputOption(String(context.option.value), options)?.iconSrc
      drawEnumContent(host, context.rect, context.option.label, iconSrc, true, colors.text, colors.item)
    }
  }
  const tooltip = selected?.description ?? props.tooltip
  if (tooltip !== undefined) selectProps.tooltip = tooltip
  if (!disabled && props.onChange !== undefined) {
    selectProps.onChange = props.onChange
  }
  select(host, x, y, width, height, selectProps)
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
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: uiShapeMetrics.tightGap,
    alignItems: "stretch",
    items: options.map((option) => ({
      width: "1fr" as const,
      height,
      draw: (slotX: number, slotY: number, slotW: number, slotH: number) => {
        const selected = option.value === props.value
        const optionDisabled = disabled || option.disabled === true
        const buttonProps = enumButtonProps(props, option.label, optionDisabled, selected)
        if (option.iconSrc !== undefined) buttonProps.startIcon = option.iconSrc
        const tooltip = option.description ?? (selected ? props.tooltip : undefined)
        if (tooltip !== undefined) buttonProps.tooltip = tooltip
        if (!optionDisabled && props.onChange !== undefined) {
          buttonProps.action = () => props.onChange!(option.value)
        }
        Button(host, slotX, slotY, slotW, slotH, buttonProps)
      },
    })),
  })
}

function drawEnumContent(
  host: UiSurface,
  rect: SelectElementContentRect,
  label: string,
  iconSrc: string | undefined,
  reserveIconColumn: boolean,
  textColor: Readonly<[number, number, number, number]>,
  itemColor: Readonly<[number, number, number, number]>,
): void {
  const iconSize = Math.min(uiShapeMetrics.iconGlyphSize, rect.h)
  flexRow({
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    gap: reserveIconColumn ? uiShapeMetrics.tightGap : 0,
    alignItems: "center",
    items: [
      reserveIconColumn && {
        width: iconSize,
        height: iconSize,
        draw: (x, y, width, height) => {
          if (iconSrc === undefined) return
          drawIconCentered(host, iconSrc, x + width / 2, y + height / 2, iconSize, {
            tint: blenderRgba8ToColor(itemColor),
            z: Z.TEXT + 0.22,
          })
        },
      },
      {
        width: "grow",
        height: rect.h,
        draw: (x, y, width, height) => {
          host.drawText(label, x, y + (height - uiShapeMetrics.compactFontPx) / 2, {
            fontPx: uiShapeMetrics.compactFontPx,
            material: textMaterial(host, blenderRgba8ToColor(textColor)),
            maxWidthPx: Math.max(1, width),
            z: Z.TEXT + 0.22,
          })
        },
      },
    ],
  })
}

function enumTriggerWidgetState(state: ButtonElementState): Readonly<{
  hovered: boolean
  pressed: boolean
  disabled: boolean
}> {
  return {
    hovered: state === "hover",
    pressed: state === "active",
    disabled: state === "disabled",
  }
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
  const buttonProps: ButtonProps = {
    children: label,
    variant: "contained",
    appearance: "toggle",
    disabled,
    selected,
  }
  return buttonProps
}
