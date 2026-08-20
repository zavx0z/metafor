import {button, type ButtonElementLayout, type ButtonElementProps, type ButtonElementState} from "./button.ts"
import {drawIconCentered} from "./icon.ts"
import {uiIcons} from "./icons.ts"
import {flexRow} from "./flex.ts"
import {mergeStyle, type StyleProps} from "./style.ts"
import {type UiSurface, Z} from "./surface.ts"

export type SelectElementProps = Omit<ButtonElementProps, "children" | "style"> & {
  value?: string | number | null
  placeholder?: string
  active?: boolean
  style?: StyleProps
  chevronSrc?: string
}

/** Draws one dense selected-value surface; options and cycle semantics stay with its consumer. */
export function select(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: SelectElementProps = {},
): void {
  const label = props.value === undefined || props.value === null || props.value === ""
    ? props.placeholder ?? ""
    : String(props.value)
  const placeholder = props.value === undefined || props.value === null || props.value === ""
  const style = mergeStyle(props)
  const elementProps: ButtonElementProps = {
    key: props.key ?? `select:${x}:${y}:${width}:${height}`,
    children: (state, layout) => drawSelectContent(surface, label, placeholder, resolvedSelectState(state, props.active), layout, props.chevronSrc ?? uiIcons.chevronDown),
    style: (state) => selectStyle(style, resolvedSelectState(state, props.active)),
  }
  if (props.disabled !== undefined) elementProps.disabled = props.disabled
  if (props.onClick !== undefined) elementProps.onClick = props.onClick
  if (props.tooltip !== undefined) elementProps.tooltip = props.tooltip
  if (props.tooltipDelayMs !== undefined) elementProps.tooltipDelayMs = props.tooltipDelayMs
  if (props.onPointerEnter !== undefined) elementProps.onPointerEnter = props.onPointerEnter
  if (props.onPointerLeave !== undefined) elementProps.onPointerLeave = props.onPointerLeave
  if (props.onPointerDown !== undefined) elementProps.onPointerDown = props.onPointerDown
  if (props.onPointerMove !== undefined) elementProps.onPointerMove = props.onPointerMove
  if (props.onPointerUp !== undefined) elementProps.onPointerUp = props.onPointerUp
  button(surface, x, y, width, height, elementProps)
}

function resolvedSelectState(state: ButtonElementState, active: boolean | undefined): ButtonElementState {
  if (state === "disabled") return state
  return active === true && state === "idle" ? "active" : state
}

function selectStyle(style: StyleProps, state: ButtonElementState): StyleProps {
  const result: StyleProps = {
    ...style,
    borderColor: style.borderColor === undefined
      ? state === "disabled" ? "borderDim" : state === "idle" ? "borderDim" : "cyan"
      : style.borderColor,
    color: style.color ?? (state === "disabled" ? "muted" : "text"),
  }
  if (style.background === undefined && style.backgroundColor === undefined) {
    result.background = state === "disabled" ? "bgPanelDim" : state === "idle" ? "bgInput" : state === "hover" ? "bgElevated" : "bgHot"
  }
  return result
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
