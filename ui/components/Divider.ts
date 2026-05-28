import {divider as renderDivider} from "./internal/renderers.ts"
import {cssColor, palette, px, span, type CssColor, type StyleProps, type UiSurface} from "@ui/elements"
import type {Color} from "@metafor/engine"
import {Color as EngineColor} from "@metafor/engine"

export type DividerColor = "primary" | "neutral" | "success" | "warning" | "error" | CssColor
export type DividerOrientation = "horizontal" | "vertical"
export type DividerVariant = "fullWidth" | "inset" | "middle"
export type DividerTextAlign = "center" | "left" | "right"

export type DividerProps = {
  children?: string | number
  orientation?: DividerOrientation
  variant?: DividerVariant
  textAlign?: DividerTextAlign
  color?: DividerColor
  light?: boolean
  flexItem?: boolean
  thickness?: number
  sx?: StyleProps
  z?: number
}

export function Divider(host: UiSurface, x: number, y: number, length: number, props: DividerProps = {}): void {
  const orientation = props.orientation ?? "horizontal"
  const thickness = props.thickness ?? px(orientation === "vertical" ? props.sx?.width : props.sx?.height, px(props.sx?.borderWidth, 1))
  const z = props.z ?? props.sx?.zIndex
  const color = withOpacity(resolveColor(props.color ?? "neutral"), props.light === true ? 0.56 : (props.sx?.opacity ?? 1))
  const [startInset, endInset] = dividerInsets(length, orientation, props.variant ?? "fullWidth")
  const start = startInset
  const usableLength = Math.max(0, length - startInset - endInset)

  if (orientation === "vertical" || props.children === undefined || props.children === null) {
    renderDivider(host, x + (orientation === "horizontal" ? start : 0), y + (orientation === "vertical" ? start : 0), usableLength, {
      orientation,
      color,
      thickness,
      ...(z === undefined ? {} : {z}),
    })
    return
  }

  const label = String(props.children)
  const fontPx = px(props.sx?.fontSize, 11)
  const labelPadX = 10
  const gap = 10
  const labelW = Math.min(Math.max(0, usableLength), Math.ceil(host.measureText(label, fontPx)) + labelPadX * 2)
  const contentStart = x + startInset
  const contentEnd = x + length - endInset
  const labelX = dividerLabelX(contentStart, usableLength, labelW, props.textAlign ?? "center")
  const leftW = Math.max(0, labelX - gap - contentStart)
  const rightX = labelX + labelW + gap
  const rightW = Math.max(0, contentEnd - rightX)
  if (leftW > 0) {
    renderDivider(host, contentStart, y, leftW, {color, thickness, ...(z === undefined ? {} : {z})})
  }
  if (rightW > 0) {
    renderDivider(host, rightX, y, rightW, {color, thickness, ...(z === undefined ? {} : {z})})
  }
  const labelH = Math.max(16, fontPx + 6)
  span(host, labelX, y - labelH / 2, labelW, labelH, {
    children: label,
    style: {
      color: props.sx?.color ?? "muted",
      fontSize: fontPx,
      textAlign: "center",
    },
  })
}

function resolveColor(color: DividerColor): Color {
  if (color instanceof EngineColor) return color
  if (color === "primary") return palette.cyan
  if (color === "success") return palette.green
  if (color === "warning") return palette.orange
  if (color === "error") return palette.red
  if (color === "neutral") return palette.borderDim
  return cssColor(color)
}

function withOpacity(color: Color, opacity: number): Color {
  const alpha = Math.min(1, Math.max(0, opacity))
  if (alpha === 1) return color
  return new EngineColor(color.r, color.g, color.b, color.a * alpha)
}

function dividerInsets(length: number, orientation: DividerOrientation, variant: DividerVariant): [number, number] {
  if (variant === "fullWidth") return [0, 0]
  const maxInset = Math.max(0, length / 2 - 1)
  if (variant === "middle") {
    const inset = Math.min(16, maxInset)
    return [inset, inset]
  }
  const start = Math.min(orientation === "horizontal" ? 72 : 16, maxInset)
  return [start, 0]
}

function dividerLabelX(x: number, length: number, labelW: number, align: DividerTextAlign): number {
  if (align === "left") return x + Math.min(16, Math.max(0, length - labelW))
  if (align === "right") return x + Math.max(0, length - labelW - 16)
  return x + Math.max(0, (length - labelW) / 2)
}
