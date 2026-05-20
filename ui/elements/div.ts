import {Z, type HitOptions, type UiSurface} from "./surface.ts"
import {span} from "./span.ts"
import {
  backgroundColor,
  boxPadding,
  cssColor,
  mergeStyle,
  px,
  type InteractiveElementProps,
} from "./style.ts"
import type {Color} from "@metafor/engine"

export type DivProps = InteractiveElementProps

export function div(surface: UiSurface, x: number, y: number, width: number, height: number, props: DivProps = {}): void {
  const style = mergeStyle(props)
  if (style.display === "none" || width <= 0 || height <= 0) return
  const fill = backgroundColor(style)
  const border = style.borderColor === null ? null : style.borderColor === undefined ? undefined : cssColor(style.borderColor)
  const borderWidth = px(style.borderWidth, 1)
  const radius = px(style.borderRadius, Math.min(32, Math.min(width, height) / 2))
  const z = style.zIndex ?? Z.CONTAINER

  if (fill !== null || border !== null) {
    const roundedOpts: {
      radius: number
      fill: Color | null
      border: Color | null
      borderWidth: number
      opacity?: number
      z: number
    } = {
      radius,
      fill,
      border: border ?? null,
      borderWidth: border === null || border === undefined ? 0 : borderWidth,
      z,
    }
    if (style.opacity !== undefined) roundedOpts.opacity = style.opacity
    surface.drawRoundedRect(x, y, width, height, roundedOpts)
  }

  if (
    props.onClick !== undefined ||
    props.onPointerEnter !== undefined ||
    props.onPointerLeave !== undefined ||
    props.onPointerDown !== undefined ||
    props.onPointerUp !== undefined
  ) {
    const hit: HitOptions = {cursor: "pointer"}
    if (props.key !== undefined) hit.key = props.key
    if (props.onPointerEnter !== undefined) hit.onPointerEnter = props.onPointerEnter
    if (props.onPointerLeave !== undefined) hit.onPointerLeave = props.onPointerLeave
    if (props.onPointerDown !== undefined) hit.onPointerDown = props.onPointerDown
    if (props.onPointerUp !== undefined) hit.onPointerUp = props.onPointerUp
    surface.hit(x, y, width, height, props.onClick ?? (() => {}), hit)
  }

  if (typeof props.children === "function") props.children()
  else if (props.children !== false && props.children !== null && props.children !== undefined) {
    const pad = boxPadding(style)
    span(surface, x + pad.left, y + pad.top, width - pad.left - pad.right, height - pad.top - pad.bottom, {
      children: String(props.children),
      style,
    })
  }
}
