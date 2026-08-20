import {Color} from "@metafor/engine"
import {
  blenderRgba8ToColor,
  blenderTheme,
  resolveWidgetColors,
  type BlenderWidgetState,
} from "./blender-theme.ts"
import {button, type ButtonElementLayout, type ButtonElementProps, type ButtonElementState} from "./button.ts"
import {controlChromeRect} from "./control-shape.ts"
import {flexColumn, flexRow} from "./flex.ts"
import {drawIconCentered} from "./icon.ts"
import {uiIcons} from "./icons.ts"
import {popover, type PopoverContext, type PopoverProps} from "./popover.ts"
import {uiShapeMetrics} from "./shape.ts"
import {mergeStyle, textMaterial, type StyleProps} from "./style.ts"
import {type UiSurface, Z} from "./surface.ts"

export type SelectElementValue = string | number

export type SelectElementOption<Value extends SelectElementValue = SelectElementValue> = Readonly<{
  value: Value
  label: string
  description?: string
  disabled?: boolean
}>

export type SelectElementProps<Value extends SelectElementValue = SelectElementValue> = Omit<ButtonElementProps, "children" | "style"> & {
  value?: Value | null
  placeholder?: string
  options?: readonly SelectElementOption<Value>[]
  open?: boolean
  active?: boolean
  style?: StyleProps
  chevronSrc?: string
  onChange?(value: Value): void
  onOpenChange?(open: boolean): void
}

/** Draws one dense select on the common Elements popover lifecycle. */
export function select<Value extends SelectElementValue = SelectElementValue>(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: SelectElementProps<Value> = {},
): void {
  const key = props.key ?? `select:${x}:${y}:${width}:${height}`
  const options = props.options ?? []
  const disabled = props.disabled === true
  const selected = options.find((option) => Object.is(option.value, props.value))
  const label = props.value === undefined || props.value === null || props.value === ""
    ? props.placeholder ?? ""
    : selected?.label ?? String(props.value)
  const placeholder = props.value === undefined || props.value === null || props.value === ""
  const style = mergeStyle(props)
  const chrome = controlChromeRect(x, y, width, height, style)
  if (disabled || options.length === 0) {
    drawSelectTrigger(surface, x, y, width, height, props, key, label, placeholder, false, undefined)
    return
  }
  const border = uiShapeMetrics.borderWidth
  const menuHeight = options.length * uiShapeMetrics.controlHeight + border * 2
  const popoverProps: PopoverProps = {
    key,
    ...(props.open === undefined ? {} : {open: props.open}),
    contentSize: {width: chrome.width, height: menuHeight},
    onOpenChange: (open) => props.onOpenChange?.(open),
    trigger: (context) => {
      drawSelectTrigger(surface, x, y, width, height, props, key, label, placeholder, context.open, context)
    },
    content: (rect, context) => {
      drawSelectMenu(surface, rect, key, options, props.value, props.onChange, context)
    },
  }
  popover(surface, chrome.x, chrome.y, chrome.width, chrome.height, popoverProps)
}

function drawSelectTrigger<Value extends SelectElementValue>(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: SelectElementProps<Value>,
  key: string,
  label: string,
  placeholder: boolean,
  open: boolean,
  context: PopoverContext | undefined,
): void {
  const disabled = props.disabled === true
  const elementProps: ButtonElementProps = {
    key,
    children: (state, layout) => drawSelectContent(
      surface,
      label,
      placeholder,
      resolvedSelectState(state, props.active === true || open),
      layout,
      props.chevronSrc ?? uiIcons.chevronDown,
    ),
    style: (state) => selectStyle(props.style ?? {}, resolvedSelectState(state, props.active === true || open)),
  }
  if (props.disabled !== undefined) elementProps.disabled = props.disabled
  if (!disabled && (context !== undefined || props.onClick !== undefined)) {
    elementProps.onClick = () => {
      context?.toggle()
      props.onClick?.()
    }
  }
  if (props.tooltip !== undefined) elementProps.tooltip = props.tooltip
  if (props.tooltipDelayMs !== undefined) elementProps.tooltipDelayMs = props.tooltipDelayMs
  if (!disabled) {
    if (props.onPointerEnter !== undefined) elementProps.onPointerEnter = props.onPointerEnter
    if (props.onPointerLeave !== undefined) elementProps.onPointerLeave = props.onPointerLeave
    if (props.onPointerDown !== undefined) elementProps.onPointerDown = props.onPointerDown
    if (props.onPointerMove !== undefined) elementProps.onPointerMove = props.onPointerMove
    if (props.onPointerUp !== undefined) elementProps.onPointerUp = props.onPointerUp
  }
  button(surface, x, y, width, height, elementProps)
}

function resolvedSelectState(state: ButtonElementState, active: boolean | undefined): ButtonElementState {
  if (state === "disabled") return state
  return active === true && state === "idle" ? "active" : state
}

function selectStyle(style: StyleProps, state: ButtonElementState): StyleProps {
  const colors = resolveWidgetColors("menu", selectWidgetState(state))
  const result: StyleProps = {
    ...style,
    borderColor: style.borderColor === undefined ? blenderRgba8ToColor(colors.outline) : style.borderColor,
    color: style.color ?? blenderRgba8ToColor(colors.text),
  }
  if (style.background === undefined && style.backgroundColor === undefined) {
    result.background = blenderRgba8ToColor(colors.inner)
  }
  return result
}

function selectWidgetState(state: ButtonElementState): BlenderWidgetState {
  return {
    hovered: state === "hover",
    pressed: state === "active",
    disabled: state === "disabled",
  }
}

function drawSelectMenu<Value extends SelectElementValue>(
  surface: UiSurface,
  rect: Readonly<{x: number; y: number; w: number; h: number}>,
  key: string,
  options: readonly SelectElementOption<Value>[],
  value: Value | null | undefined,
  onChange: ((value: Value) => void) | undefined,
  context: PopoverContext,
): void {
  const border = uiShapeMetrics.borderWidth
  surface.drawRoundedShadow(rect.x, rect.y, rect.w, rect.h, {
    radius: uiShapeMetrics.lowRadius,
    blur: blenderTheme.material.menuShadowWidth,
    spread: 0,
    color: new Color(0, 0, 0, 1),
    opacity: blenderTheme.material.menuShadowFactor,
    z: Z.ELEMENT + 0.19,
  })
  const menuColors = resolveWidgetColors("menuBack")
  surface.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
    radius: uiShapeMetrics.lowRadius,
    fill: blenderRgba8ToColor(menuColors.inner),
    border: blenderRgba8ToColor(menuColors.outline),
    borderWidth: border,
    z: Z.ELEMENT + 0.2,
  })

  flexColumn({
    x: rect.x + border,
    y: rect.y + border,
    w: Math.max(0, rect.w - border * 2),
    h: Math.max(0, rect.h - border * 2),
    gap: 0,
    items: options.map((option) => ({
      height: uiShapeMetrics.controlHeight,
      draw: (rowX, rowY, rowWidth, rowHeight) => {
        const rowKey = `${key}:option:${String(option.value)}`
        const state = surface.hitState(rowX, rowY, rowWidth, rowHeight, rowKey)
        const selected = Object.is(option.value, value)
        const disabled = option.disabled === true
        const colors = resolveWidgetColors("menuItem", {
          disabled,
          hovered: state.hovered || state.pressed,
          selectedDraw: selected,
        })
        surface.drawRoundedRect(rowX, rowY, rowWidth, rowHeight, {
          radius: 0,
          fill: blenderRgba8ToColor(colors.inner),
          border: null,
          borderWidth: 0,
          z: Z.ELEMENT + 0.22,
        })
        surface.drawText(option.label, rowX + uiShapeMetrics.tightGap * 2, rowY + (rowHeight - uiShapeMetrics.compactFontPx) / 2, {
          fontPx: uiShapeMetrics.compactFontPx,
          material: textMaterial(surface, blenderRgba8ToColor(colors.text)),
          maxWidthPx: Math.max(1, rowWidth - uiShapeMetrics.tightGap * 4),
          z: Z.TEXT + 0.22,
        })
        const tooltip = option.description === undefined ? undefined : {label: option.description, delayMs: 450}
        surface.hit(rowX, rowY, rowWidth, rowHeight, () => {
          if (disabled) return
          onChange?.(option.value)
          context.close()
        }, {
          key: rowKey,
          cursor: disabled ? "default" : "pointer",
          ...(tooltip === undefined ? {} : {tooltip}),
          onPointerEnter: () => surface.requestKeyedRender(key),
          onPointerLeave: () => surface.requestKeyedRender(key),
        })
        if (option.description !== undefined) {
          surface.drawTooltipForHit(rowX, rowY, rowWidth, rowHeight, option.description, {delayMs: 450})
        }
      },
    })),
  })
}

function drawSelectContent(
  surface: UiSurface,
  label: string,
  placeholder: boolean,
  state: ButtonElementState,
  layout: ButtonElementLayout,
  chevronSrc: string,
): void {
  const content = layout.content
  const colors = resolveWidgetColors("menu", selectWidgetState(state))
  const text = placeholder ? resolveWidgetColors("menu", {inactive: true}).text : colors.text
  flexRow({
    x: content.x,
    y: content.y,
    w: content.width,
    h: content.height,
    gap: layout.gap,
    alignItems: "center",
    items: [
      {width: "grow", height: content.height, draw: (x, y, width, height) => {
        surface.drawText(label, x, y + (height - layout.fontPx) / 2, {
          fontPx: layout.fontPx,
          material: textMaterial(surface, blenderRgba8ToColor(text)),
          maxWidthPx: Math.max(1, width),
          z: Z.TEXT,
        })
      }},
      {width: layout.iconPx, height: layout.iconPx, draw: (x, y, width, height) => {
        drawIconCentered(surface, chevronSrc, x + width / 2, y + height / 2, layout.iconPx, {
          opacity: 1,
          tint: blenderRgba8ToColor(colors.item),
          z: Z.TEXT,
        })
      }},
    ],
  })
}
