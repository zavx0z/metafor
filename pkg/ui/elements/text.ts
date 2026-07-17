import type {UiSurface} from "./surface.ts"
import {Z} from "./surface.ts"
import {span, type SpanProps} from "./span.ts"
import {cssColor, mergeStyle, px, visionBorder, type ElementBaseProps} from "./style.ts"

export function p(surface: UiSurface, x: number, y: number, width: number, height: number, props: SpanProps = {}): void {
  const style = mergeStyle(props)
  span(surface, x, y, width, height, {...props, style: {...style, fontSize: style.fontSize ?? 12, color: style.color ?? "text"}})
}

export function h1(surface: UiSurface, x: number, y: number, width: number, height: number, props: SpanProps = {}): void {
  const style = mergeStyle(props)
  span(surface, x, y, width, height, {...props, style: {...style, fontSize: style.fontSize ?? 22, color: style.color ?? "cyan"}})
}

export function h2(surface: UiSurface, x: number, y: number, width: number, height: number, props: SpanProps = {}): void {
  const style = mergeStyle(props)
  span(surface, x, y, width, height, {...props, style: {...style, fontSize: style.fontSize ?? 16, color: style.color ?? "cyan"}})
}

export function h3(surface: UiSurface, x: number, y: number, width: number, height: number, props: SpanProps = {}): void {
  const style = mergeStyle(props)
  span(surface, x, y, width, height, {...props, style: {...style, fontSize: style.fontSize ?? 13, color: style.color ?? "cyan"}})
}

export function h4(surface: UiSurface, x: number, y: number, width: number, height: number, props: SpanProps = {}): void {
  h3(surface, x, y, width, height, props)
}

export function h5(surface: UiSurface, x: number, y: number, width: number, height: number, props: SpanProps = {}): void {
  h3(surface, x, y, width, height, props)
}

export function h6(surface: UiSurface, x: number, y: number, width: number, height: number, props: SpanProps = {}): void {
  h3(surface, x, y, width, height, props)
}

export function hr(surface: UiSurface, x: number, y: number, width: number, props: ElementBaseProps = {}): void {
  const style = mergeStyle(props)
  const thickness = px(style.height ?? style.borderWidth, 1)
  const color = style.backgroundColor ?? style.background ?? style.color ?? "borderDim"
  surface.drawRect(x, Math.round(y - thickness / 2), width, thickness, color === "glass" ? visionBorder : cssColor(color), style.zIndex ?? Z.SEPARATOR)
}
