import type {HitOptions, UiSurface} from "./surface.ts"
import {Z} from "./surface.ts"
import {div} from "./div.ts"
import {controlChromePadding, controlChromeRect} from "./control-shape.ts"
import {mergeStyle, px, textMaterial, type ElementChildren, type InteractiveElementProps, type StyleProps} from "./style.ts"
import {uiShapeMetrics} from "./shape.ts"

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
  const chrome = controlChromeRect(x, y, width, height, style)
  const pad = controlChromePadding(style)

  div(surface, chrome.x, chrome.y + pressOffsetY, chrome.width, chrome.height - pressOffsetY, {
    children: typeof props.children === "function" ? () => {
      const render = props.children
      if (typeof render === "function") render(state)
    } : undefined,
    key,
    style: {
      ...style,
      background: style.background === undefined ? fill : style.background,
      borderColor: style.borderColor === undefined ? border : style.borderColor,
      borderRadius: style.borderRadius ?? uiShapeMetrics.lowRadius,
      borderWidth: style.borderWidth ?? uiShapeMetrics.borderWidth,
      color: style.color ?? (state === "disabled" ? "muted" : "text"),
      fontSize: style.fontSize ?? uiShapeMetrics.compactFontPx,
      zIndex: style.zIndex ?? Z.ELEMENT,
    },
  })

  const shouldRegisterHit = props.disabled !== true
    || props.tooltip !== undefined
    || props.onPointerEnter !== undefined
    || props.onPointerLeave !== undefined
  if (shouldRegisterHit) {
    const hitOptions: HitOptions = {
      cursor: props.disabled === true ? "default" : "pointer",
      key,
    }
    if (props.disabled !== true) {
      hitOptions.onPointerUp = () => {
        props.onPointerUp?.()
        holdPressedVisual(surface, key)
      }
      if (props.onPointerDown !== undefined) hitOptions.onPointerDown = props.onPointerDown
    }
    if (props.onPointerEnter !== undefined) hitOptions.onPointerEnter = props.onPointerEnter
    if (props.onPointerLeave !== undefined) hitOptions.onPointerLeave = props.onPointerLeave
    if (props.tooltip !== undefined) {
      const action = props.disabled === true ? (() => {}) : props.onClick ?? (() => {})
      surface.hit(x, y, width, height, action, {
        ...hitOptions,
        tooltip: {label: props.tooltip, delayMs: props.tooltipDelayMs ?? 450},
      })
      const tooltipOpts: {delayMs?: number} = {}
      if (props.tooltipDelayMs !== undefined) tooltipOpts.delayMs = props.tooltipDelayMs
      surface.drawTooltipForHit(x, y, width, height, props.tooltip, tooltipOpts)
    } else if (props.disabled !== true) {
      surface.hit(x, y, width, height, props.onClick ?? (() => {}), hitOptions)
    }
  }

  if (props.children !== false && props.children !== null && props.children !== undefined && typeof props.children !== "function") {
    const fontSize = px(style.fontSize, uiShapeMetrics.compactFontPx)
    const maxWidth = Math.max(1, chrome.width - pad.left - pad.right)
    surface.drawTextCentered(String(props.children), chrome.x + chrome.width / 2, chrome.y + pressOffsetY + chrome.height / 2, {
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
    surface.requestHitRender(key)
  }, MIN_PRESS_VISUAL_MS)
  pressedVisuals.set(surface, entry)
  surface.requestHitRender(key)
}
