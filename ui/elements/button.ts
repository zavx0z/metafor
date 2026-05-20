import type {HitOptions, UiSurface} from "./surface.ts"
import {Z} from "./surface.ts"
import {div} from "./div.ts"
import {boxPadding, mergeStyle, px, textMaterial, type ElementChildren, type InteractiveElementProps, type StyleProps} from "./style.ts"

export type ButtonElementState = "idle" | "hover" | "active" | "disabled"
export type ButtonElementChildren = ElementChildren | ((state: ButtonElementState) => void)
export type ButtonElementProps = Omit<InteractiveElementProps, "children" | "style"> & {
  children?: ButtonElementChildren
  style?: StyleProps | ((state: ButtonElementState) => StyleProps)
  disabled?: boolean
  tooltip?: string
  tooltipDelayMs?: number
}

const MIN_PRESS_VISUAL_MS = 120
const pressedVisuals = new WeakMap<UiSurface, {key: string | null; timer: ReturnType<typeof setTimeout> | null}>()

export function button(surface: UiSurface, x: number, y: number, width: number, height: number, props: ButtonElementProps = {}): void {
  const key = props.key ?? `button:${x}:${y}:${width}:${height}`
  const hit = surface.hitState(x, y, width, height, key)
  const visualPressed = pressedVisualKey(surface) === key
  const state: ButtonElementState = props.disabled === true ? "disabled" : hit.pressed || visualPressed ? "active" : hit.hovered ? "hover" : "idle"
  const rawStyle = typeof props.style === "function" ? props.style(state) : props.style
  const styleInput: {sx?: StyleProps; style?: StyleProps} = {}
  if (props.sx !== undefined) styleInput.sx = props.sx
  if (rawStyle !== undefined) styleInput.style = rawStyle
  const style = mergeStyle(styleInput)
  const border = state === "disabled" ? "borderDim" : state === "idle" ? "border" : "cyan"
  const fill = state === "disabled" ? "bgPanelDim" : "glass"
  const active = state === "active"
  const pressOffsetY = active ? 1 : 0
  const pad = boxPadding(style)

  div(surface, x, y + pressOffsetY, width, height - pressOffsetY, {
    children: typeof props.children === "function" ? () => {
      const render = props.children
      if (typeof render === "function") render(state)
    } : undefined,
    key,
    style: {
      ...style,
      background: style.background === undefined ? fill : style.background,
      borderColor: style.borderColor === undefined ? border : style.borderColor,
      borderRadius: style.borderRadius ?? 999,
      color: style.color ?? (state === "disabled" ? "muted" : "text"),
      fontSize: style.fontSize ?? 12,
      zIndex: style.zIndex ?? Z.ELEMENT,
    },
  })

  if (props.disabled !== true) {
    const hitOptions: HitOptions = {
      cursor: "pointer",
      key,
      onPointerUp: () => {
        props.onPointerUp?.()
        holdPressedVisual(surface, key)
      },
    }
    if (props.onPointerEnter !== undefined) hitOptions.onPointerEnter = props.onPointerEnter
    if (props.onPointerLeave !== undefined) hitOptions.onPointerLeave = props.onPointerLeave
    if (props.onPointerDown !== undefined) hitOptions.onPointerDown = props.onPointerDown
    if (props.tooltip !== undefined) {
      surface.hit(x, y, width, height, props.onClick ?? (() => {}), {
        ...hitOptions,
        tooltip: {label: props.tooltip, delayMs: props.tooltipDelayMs ?? 450},
      })
      const tooltipOpts: {delayMs?: number} = {}
      if (props.tooltipDelayMs !== undefined) tooltipOpts.delayMs = props.tooltipDelayMs
      surface.drawTooltipForHit(x, y, width, height, props.tooltip, tooltipOpts)
    } else {
      surface.hit(x, y, width, height, props.onClick ?? (() => {}), hitOptions)
    }
  }

  if (props.children !== false && props.children !== null && props.children !== undefined && typeof props.children !== "function") {
    const fontSize = px(style.fontSize, 12)
    const maxWidth = Math.max(1, width - pad.left - pad.right)
    surface.drawTextCentered(String(props.children), x + width / 2, y + pressOffsetY + height / 2, {
      fontPx: fontSize,
      material: textMaterial(surface, style.color ?? (state === "disabled" ? "muted" : "text")),
      maxWidthPx: maxWidth,
    })
  }
}

function pressedVisualKey(surface: UiSurface): string | null {
  return pressedVisuals.get(surface)?.key ?? null
}

function holdPressedVisual(surface: UiSurface, key: string): void {
  const entry = pressedVisuals.get(surface) ?? {key: null, timer: null}
  if (entry.timer !== null) clearTimeout(entry.timer)
  entry.key = key
  entry.timer = setTimeout(() => {
    entry.timer = null
    if (entry.key !== key) return
    entry.key = null
    surface.requestRender()
  }, MIN_PRESS_VISUAL_MS)
  pressedVisuals.set(surface, entry)
  surface.requestRender()
}
