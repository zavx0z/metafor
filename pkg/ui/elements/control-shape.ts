import {boxPadding, px, type StyleProps} from "./style.ts"
import {uiShapeMetrics} from "./shape.ts"

export type ControlChromeRect = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

export type ControlChromePadding = Readonly<{
  top: number
  right: number
  bottom: number
  left: number
}>

/** Resolves dense visible control chrome inside the caller-owned hit/layout rect. */
export function controlChromeRect(
  x: number,
  y: number,
  width: number,
  height: number,
  style: StyleProps,
): ControlChromeRect {
  const visibleHeight = Math.min(
    Math.max(0, height),
    Math.max(0, px(style.height, uiShapeMetrics.controlHeight)),
  )
  return {
    x,
    y: y + (height - visibleHeight) / 2,
    width: Math.max(0, width),
    height: visibleHeight,
  }
}

/** Keeps explicit CSS padding authoritative and supplies only missing dense sides. */
export function controlChromePadding(style: StyleProps): ControlChromePadding {
  const padding = boxPadding(style)
  const denseInline = uiShapeMetrics.tightGap * 2
  return {
    top: padding.top,
    right: style.paddingRight !== undefined || style.paddingX !== undefined || style.padding !== undefined
      ? padding.right
      : denseInline,
    bottom: padding.bottom,
    left: style.paddingLeft !== undefined || style.paddingX !== undefined || style.padding !== undefined
      ? padding.left
      : denseInline,
  }
}
