import type {UiSurface} from "./surface.ts"
import {mergeStyle, px, textMaterial, type ElementBaseProps} from "./style.ts"

export type SpanProps = ElementBaseProps

export function span(surface: UiSurface, x: number, y: number, width: number, height: number, props: SpanProps = {}): void {
  if (props.children === false || props.children === null || props.children === undefined) return
  if (typeof props.children === "function") {
    props.children()
    return
  }
  const style = mergeStyle(props)
  const text = String(props.children)
  const fontSize = px(style.fontSize, 12)
  const material = textMaterial(surface, style.color)
  const textY = surface.textTopForVisualCenter(text, y + height / 2, fontSize)
  const maxWidthPx = width
  if (style.textAlign === "center") {
    surface.drawTextCentered(text, x + width / 2, y + height / 2, {
      fontPx: fontSize,
      material,
      maxWidthPx,
    })
    return
  }
  if (style.textAlign === "right") {
    const textW = Math.min(surface.measureText(text, fontSize), width)
    surface.drawText(text, x + width - textW, textY, {
      fontPx: fontSize,
      material,
      maxWidthPx,
    })
    return
  }
  surface.drawText(text, x, textY, {
    fontPx: fontSize,
    material,
    maxWidthPx,
  })
}
