import type {HitOptions, UiSurface} from "./surface.ts"
import {Z} from "./surface.ts"
import {div} from "./div.ts"
import {controlChromePadding} from "./control-shape.ts"
import {mergeStyle, px, textMaterial, type ElementChildren, type InteractiveElementProps, type StyleProps} from "./style.ts"
import {uiShapeMetrics} from "./shape.ts"
import {drawGroupedCellChrome, type GroupedCellAppearance} from "./grouped-cell.ts"
import {planButtonSize, type ButtonElementSize} from "./button-size.ts"
import {buttonHitRect, type ButtonInternalProps} from "./button-internal.ts"
import {
  blenderRgba8ToColor,
  resolveWidgetColors,
  type BlenderWidgetClass,
  type ResolvedBlenderWidgetColors,
} from "./blender-theme.ts"

export type ButtonElementState = "idle" | "hover" | "active" | "disabled"
export {
  buttonSizeMetrics,
  planButtonSize,
  type ButtonElementSize,
  type ButtonSizeMetrics,
  type ButtonSizePlan,
} from "./button-size.ts"
export type ButtonElementAppearance = "button" | "regular" | "text" | "number" | "tool" | "toggle" | "toolbar-item" | "tab"
export type ButtonElementLayout = Readonly<{
  chrome: Readonly<{x: number; y: number; width: number; height: number}>
  content: Readonly<{x: number; y: number; width: number; height: number}>
  fontPx: number
  iconPx: number
  gap: number
  colors: ResolvedBlenderWidgetColors
}>
export type ButtonElementChildren = ElementChildren | ((state: ButtonElementState, layout: ButtonElementLayout) => void)
export type ButtonElementProps = Omit<InteractiveElementProps, "children" | "style"> & {
  children?: ButtonElementChildren
  style?: StyleProps | ((state: ButtonElementState) => StyleProps)
  disabled?: boolean
  selected?: boolean
  focused?: boolean
  appearance?: ButtonElementAppearance
  groupedCell?: GroupedCellAppearance
  size?: ButtonElementSize
  tooltip?: string
  tooltipDelayMs?: number
}

export function button(surface: UiSurface, x: number, y: number, width: number, height: number, props: ButtonElementProps = {}): void {
  const key = props.key ?? `button:${x}:${y}:${width}:${height}`
  surface.registerRenderKey(key)
  const hit = surface.hitState(x, y, width, height, key)
  const state: ButtonElementState = props.disabled === true ? "disabled" : hit.pressed ? "active" : hit.hovered ? "hover" : "idle"
  const colors = resolveWidgetColors(buttonWidgetClass(props.appearance), {
    hovered: hit.hovered,
    pressed: hit.pressed,
    selected: props.selected === true,
    activeDefault: props.focused === true,
    disabled: props.disabled === true,
  })
  const rawStyle = typeof props.style === "function" ? props.style(state) : props.style
  const styleInput: {sx?: StyleProps; style?: StyleProps} = {}
  if (props.sx !== undefined) styleInput.sx = props.sx
  if (rawStyle !== undefined) styleInput.style = rawStyle
  const style = mergeStyle(styleInput)
  const border = blenderRgba8ToColor(colors.outline)
  const fill = blenderRgba8ToColor(colors.inner)
  const sizePlan = props.groupedCell === undefined
    ? planButtonSize(x, y, width, height, props.size, style)
    : null
  const chrome = sizePlan?.chrome ?? {x, y, width, height}
  const pad = sizePlan === null ? controlChromePadding(style) : null
  const visibleChrome = chrome
  const fontPx = sizePlan?.fontPx ?? px(style.fontSize, buttonFontPx(props.size))
  const content = sizePlan?.content ?? {
    x: visibleChrome.x + (pad?.left ?? 0),
    y: visibleChrome.y,
    width: Math.max(0, visibleChrome.width - (pad?.left ?? 0) - (pad?.right ?? 0)),
    height: visibleChrome.height,
  }
  const layout: ButtonElementLayout = {
    chrome: visibleChrome,
    content,
    fontPx,
    iconPx: sizePlan?.iconPx ?? Math.min(uiShapeMetrics.iconGlyphSize, content.width, content.height),
    gap: sizePlan?.gap ?? uiShapeMetrics.tightGap,
    colors,
  }

  const chromeStyle: StyleProps = {
    ...style,
    background: style.background === undefined ? fill : style.background,
    borderColor: props.groupedCell === undefined
      ? style.borderColor === undefined ? border : style.borderColor
      : null,
    borderRadius: sizePlan?.radius ?? (style.borderRadius ?? 0),
    borderWidth: props.groupedCell === undefined
      ? sizePlan?.borderWidth ?? uiShapeMetrics.borderWidth
      : 0,
    color: style.color ?? blenderRgba8ToColor(colors.text),
    fontSize: fontPx,
    zIndex: style.zIndex ?? Z.ELEMENT,
  }
  const customChildren = typeof props.children === "function" ? props.children : null
  if (props.groupedCell === undefined) {
    div(surface, visibleChrome.x, visibleChrome.y, visibleChrome.width, visibleChrome.height, {
      children: customChildren === null ? undefined : () => customChildren(state, layout),
      key,
      style: chromeStyle,
    })
  } else {
    drawGroupedCellChrome(surface, visibleChrome, chromeStyle, props.groupedCell)
    customChildren?.(state, layout)
  }

  const shouldRegisterHit = props.disabled !== true || props.tooltip !== undefined
  if (shouldRegisterHit) {
    const interactionRect = (props as ButtonElementProps & ButtonInternalProps)[buttonHitRect]
      ?? sizePlan?.hit
      ?? visibleChrome
    const hitOptions: HitOptions = {
      cursor: props.disabled === true ? "default" : "pointer",
      key,
    }
    if (props.disabled !== true) {
      hitOptions.onPointerDown = (localX, localY, event) => {
        props.onPointerDown?.(localX, localY, event)
        surface.requestKeyedRender(key)
      }
      hitOptions.onPointerUp = (event) => {
        props.onPointerUp?.(event)
        surface.requestKeyedRender(key)
      }
      hitOptions.onPointerEnter = () => {
        props.onPointerEnter?.()
        surface.requestKeyedRender(key)
      }
      hitOptions.onPointerLeave = () => {
        props.onPointerLeave?.()
        surface.requestKeyedRender(key)
      }
    }
    if (props.tooltip !== undefined) {
      const action = props.disabled === true ? (() => {}) : props.onClick ?? (() => {})
      surface.hit(interactionRect.x, interactionRect.y, interactionRect.width, interactionRect.height, action, {
        ...hitOptions,
        tooltip: {label: props.tooltip, delayMs: props.tooltipDelayMs ?? 450},
      })
      const tooltipOpts: {delayMs?: number} = {}
      if (props.tooltipDelayMs !== undefined) tooltipOpts.delayMs = props.tooltipDelayMs
      surface.drawTooltipForHit(
        interactionRect.x,
        interactionRect.y,
        interactionRect.width,
        interactionRect.height,
        props.tooltip,
        tooltipOpts,
      )
    } else if (props.disabled !== true) {
      surface.hit(
        interactionRect.x,
        interactionRect.y,
        interactionRect.width,
        interactionRect.height,
        props.onClick ?? (() => {}),
        hitOptions,
      )
    }
  }

  if (props.children !== false && props.children !== null && props.children !== undefined && typeof props.children !== "function") {
    const maxWidth = Math.max(1, content.width)
    surface.drawTextCentered(String(props.children), content.x + content.width / 2, content.y + content.height / 2, {
      fontPx,
      material: textMaterial(surface, style.color ?? blenderRgba8ToColor(colors.text)),
      maxWidthPx: maxWidth,
    })
  }
}

function buttonWidgetClass(appearance: ButtonElementAppearance | undefined): BlenderWidgetClass {
  if (appearance === "text") return "text"
  if (appearance === "number") return "number"
  if (appearance === "tool") return "tool"
  if (appearance === "toggle") return "toggle"
  if (appearance === "toolbar-item") return "toolbarItem"
  if (appearance === "tab") return "tab"
  return "regular"
}

function buttonFontPx(size: ButtonElementSize | undefined): number {
  if (size === "small") return uiShapeMetrics.compactFontPx - uiShapeMetrics.borderWidth
  if (size === "large") return uiShapeMetrics.compactFontPx + uiShapeMetrics.tightGap
  return uiShapeMetrics.compactFontPx
}
