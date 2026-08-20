import {controlChromeRect} from "./control-shape.ts"
import {div, type DivProps} from "./div.ts"
import {mergeStyle, type StyleProps} from "./style.ts"
import {uiShapeMetrics} from "./shape.ts"
import {Z, type UiSurface} from "./surface.ts"

export type ControlElementProps = DivProps

/** Draws one Elements-owned dense control chrome inside the caller layout rect. */
export function control(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: ControlElementProps = {},
): void {
  const style = mergeStyle(props)
  const chrome = controlChromeRect(x, y, width, height, style)
  const chromeStyle: StyleProps = {
    ...style,
    borderColor: style.borderColor === undefined ? "borderDim" : style.borderColor,
    borderRadius: style.borderRadius ?? uiShapeMetrics.lowRadius,
    borderWidth: style.borderWidth ?? uiShapeMetrics.borderWidth,
    color: style.color ?? "text",
    fontSize: style.fontSize ?? uiShapeMetrics.compactFontPx,
    zIndex: style.zIndex ?? Z.ELEMENT,
  }
  if (style.background === undefined && style.backgroundColor === undefined) chromeStyle.background = "bgInput"
  const chromeProps: DivProps = {...props, style: chromeStyle}
  delete chromeProps.sx
  div(surface, chrome.x, chrome.y, chrome.width, chrome.height, chromeProps)
}
