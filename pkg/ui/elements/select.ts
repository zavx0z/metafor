import {button, type ButtonElementLayout, type ButtonElementProps, type ButtonElementState} from "./button.ts"
import {controlChromeRect} from "./control-shape.ts"
import {drawIconCentered} from "./icon.ts"
import {uiIcons} from "./icons.ts"
import {flexColumn, flexRow} from "./flex.ts"
import {uiShapeMetrics} from "./shape.ts"
import {mergeStyle, type StyleProps} from "./style.ts"
import {palette} from "./theme.ts"
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

type SelectRuntimeState = {
  openKeys: Set<string>
}

const selectRuntime = new WeakMap<UiSurface, SelectRuntimeState>()

/** Draws one controlled dense select with an Elements-owned disclosure menu. */
export function select<Value extends SelectElementValue = SelectElementValue>(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: SelectElementProps<Value> = {},
): void {
  const key = props.key ?? `select:${x}:${y}:${width}:${height}`
  const runtime = selectRuntimeFor(surface)
  const options = props.options ?? []
  const disabled = props.disabled === true
  if (disabled) runtime.openKeys.delete(key)
  const selected = options.find((option) => Object.is(option.value, props.value))
  const label = props.value === undefined || props.value === null || props.value === ""
    ? props.placeholder ?? ""
    : selected?.label ?? String(props.value)
  const placeholder = props.value === undefined || props.value === null || props.value === ""
  const style = mergeStyle(props)
  const open = !disabled && options.length > 0 && (props.open ?? runtime.openKeys.has(key))
  surface.registerRenderKey(key)
  const elementProps: ButtonElementProps = {
    key,
    children: (state, layout) => drawSelectContent(surface, label, placeholder, resolvedSelectState(state, props.active === true || open), layout, props.chevronSrc ?? uiIcons.chevronDown),
    style: (state) => selectStyle(style, resolvedSelectState(state, props.active === true || open)),
  }
  if (props.disabled !== undefined) elementProps.disabled = props.disabled
  if (!disabled && (options.length > 0 || props.onClick !== undefined)) {
    elementProps.onClick = () => {
      const nextOpen = options.length > 0 && !open
      if (props.open === undefined) {
        if (nextOpen) runtime.openKeys.add(key)
        else runtime.openKeys.delete(key)
      }
      props.onOpenChange?.(nextOpen)
      props.onClick?.()
      surface.requestKeyedRender(key)
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
  if (open) {
    drawSelectMenu(surface, controlChromeRect(x, y, width, height, style), key, options, props.value, props.onChange, props.onOpenChange, props.open === undefined, runtime)
  }
}

function selectRuntimeFor(surface: UiSurface): SelectRuntimeState {
  let runtime = selectRuntime.get(surface)
  if (runtime === undefined) {
    runtime = {openKeys: new Set<string>()}
    selectRuntime.set(surface, runtime)
  }
  return runtime
}

function resolvedSelectState(state: ButtonElementState, active: boolean | undefined): ButtonElementState {
  if (state === "disabled") return state
  return active === true && state === "idle" ? "active" : state
}

function selectStyle(style: StyleProps, state: ButtonElementState): StyleProps {
  const result: StyleProps = {
    ...style,
    borderColor: style.borderColor === undefined
      ? state === "disabled" || state === "idle" ? "borderRule" : "cyan"
      : style.borderColor,
    color: style.color ?? (state === "disabled" ? "muted" : "text"),
  }
  if (style.background === undefined && style.backgroundColor === undefined) {
    result.background = state === "disabled" ? "bgPanelDim" : state === "idle" ? "bgInput" : state === "hover" ? "bgElevated" : "bgHot"
  }
  return result
}

function drawSelectMenu<Value extends SelectElementValue>(
  surface: UiSurface,
  chrome: Readonly<{x: number; y: number; width: number; height: number}>,
  key: string,
  options: readonly SelectElementOption<Value>[],
  value: Value | null | undefined,
  onChange: ((value: Value) => void) | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
  internallyControlled: boolean,
  runtime: SelectRuntimeState,
): void {
  const border = uiShapeMetrics.borderWidth
  const menuX = chrome.x
  const menuY = chrome.y + chrome.height + uiShapeMetrics.separatorWidth
  const menuHeight = options.length * uiShapeMetrics.controlHeight + border * 2
  surface.drawRoundedRect(menuX, menuY, chrome.width, menuHeight, {
    radius: uiShapeMetrics.lowRadius,
    fill: palette.bgPanel,
    border: palette.borderRule,
    borderWidth: border,
    z: Z.ELEMENT + 0.2,
  })

  flexColumn({
    x: menuX + border,
    y: menuY + border,
    w: Math.max(0, chrome.width - border * 2),
    h: Math.max(0, menuHeight - border * 2),
    gap: 0,
    items: options.map((option) => ({
      height: uiShapeMetrics.controlHeight,
      draw: (rowX, rowY, rowWidth, rowHeight) => {
        const rowKey = `${key}:option:${String(option.value)}`
        const state = surface.hitState(rowX, rowY, rowWidth, rowHeight, rowKey)
        const selected = Object.is(option.value, value)
        const disabled = option.disabled === true
        const fill = disabled
          ? palette.bgPanelDim
          : selected
            ? palette.bgHot
            : state.hovered || state.pressed
              ? palette.bgElevated
              : palette.bgInput
        surface.drawRoundedRect(rowX, rowY, rowWidth, rowHeight, {
          radius: 0,
          fill,
          border: null,
          borderWidth: 0,
          z: Z.ELEMENT + 0.22,
        })
        surface.drawText(option.label, rowX + uiShapeMetrics.tightGap * 2, rowY + (rowHeight - uiShapeMetrics.compactFontPx) / 2, {
          fontPx: uiShapeMetrics.compactFontPx,
          material: disabled ? surface.materials.muted : surface.materials.text,
          maxWidthPx: Math.max(1, rowWidth - uiShapeMetrics.tightGap * 4),
          z: Z.TEXT + 0.22,
        })
        if (disabled) return
        const tooltip = option.description === undefined
          ? undefined
          : {label: option.description, delayMs: 450}
        surface.hit(rowX, rowY, rowWidth, rowHeight, () => {
          if (internallyControlled) runtime.openKeys.delete(key)
          onChange?.(option.value)
          onOpenChange?.(false)
          surface.requestKeyedRender(key)
        }, {
          key: rowKey,
          cursor: "pointer",
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
          material: placeholder || state === "disabled" ? surface.materials.muted : surface.materials.text,
          maxWidthPx: Math.max(1, width),
          z: Z.TEXT,
        })
      }},
      {width: layout.iconPx, height: layout.iconPx, draw: (x, y, width, height) => {
        drawIconCentered(surface, chevronSrc, x + width / 2, y + height / 2, layout.iconPx, {
          opacity: state === "disabled" ? 0.36 : 0.78,
          z: Z.TEXT,
        })
      }},
    ],
  })
}
