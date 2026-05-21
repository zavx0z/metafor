import {Color, TextMaterial} from "@metafor/engine"
import type {UiSurface} from "./surface.ts"
import {palette} from "./theme.ts"

export type CssLength = number | `${number}px` | `${number}%` | `${number}fr` | "auto" | "grow"
export type CssColor = Color | keyof typeof palette | `#${string}` | `rgb(${string})` | `rgba(${string})` | "transparent"
export type CssDisplay = "block" | "inline" | "flex" | "none"
export type CssAlignItems = "start" | "center" | "end" | "stretch"
export type CssJustifyContent = "start" | "center" | "end" | "space-between" | "space-around"
export type CssCursor = "default" | "pointer" | "text"
export type CssTextAlign = "left" | "center" | "right"
export type CssOverflow = "visible" | "hidden" | "auto" | "scroll"

export type StyleProps = {
  width?: CssLength
  height?: CssLength
  minWidth?: CssLength
  minHeight?: CssLength
  maxWidth?: CssLength
  maxHeight?: CssLength
  padding?: CssLength
  paddingX?: CssLength
  paddingY?: CssLength
  paddingTop?: CssLength
  paddingRight?: CssLength
  paddingBottom?: CssLength
  paddingLeft?: CssLength
  margin?: CssLength
  gap?: CssLength
  borderRadius?: CssLength
  borderWidth?: CssLength
  borderColor?: CssColor | null
  background?: CssColor | "glass" | null
  backgroundColor?: CssColor | "glass" | null
  color?: CssColor
  fontSize?: CssLength
  lineHeight?: number | CssLength
  textAlign?: CssTextAlign
  overflow?: CssOverflow
  overflowX?: CssOverflow
  overflowY?: CssOverflow
  scrollbarWidth?: CssLength
  scrollbarColor?: CssColor
  scrollbarTrackColor?: CssColor
  display?: CssDisplay
  alignItems?: CssAlignItems
  justifyContent?: CssJustifyContent
  opacity?: number
  zIndex?: number
}

export type ElementChildren = string | number | false | null | undefined | (() => void)

export type ElementBaseProps = {
  children?: ElementChildren
  key?: string
  style?: StyleProps
  /** @deprecated Use style in @metafor/elements. sx is reserved for @metafor/components. */
  sx?: StyleProps
}

export type InteractiveElementProps = ElementBaseProps & {
  onClick?: () => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onPointerDown?: () => void
  onPointerUp?: () => void
}

export type SxProps = StyleProps

export const visionGlass = new Color(0.055, 0.075, 0.11, 0.58)
export const visionBorder = new Color(0.82, 0.91, 1, 0.22)

const textMaterialCache = new Map<string, TextMaterial>()

export function px(value: CssLength | undefined, fallback = 0): number {
  if (value === undefined) return fallback
  if (typeof value === "number") return value
  if (value.endsWith("px")) return Number.parseFloat(value)
  if (value === "auto" || value === "grow") return fallback
  if (value.endsWith("%") || value.endsWith("fr")) return fallback
  return fallback
}

export function cssColor(value: CssColor): Color {
  if (value instanceof Color) return value
  if (value === "transparent") return new Color(0, 0, 0, 0)
  if (value in palette) return palette[value as keyof typeof palette]
  if (value.startsWith("#")) return hexColor(value)
  if (value.startsWith("rgb(") || value.startsWith("rgba(")) return rgbColor(value)
  return palette.text
}

export function mergeStyle(props: {style?: StyleProps; sx?: StyleProps}): StyleProps {
  return {...props.sx, ...props.style}
}

export function backgroundColor(style: StyleProps): Color | null {
  const value = style.backgroundColor !== undefined ? style.backgroundColor : style.background !== undefined ? style.background : "glass"
  if (value === null) return null
  if (value === "glass") return visionGlass
  return cssColor(value)
}

export function boxPadding(style: StyleProps): {top: number; right: number; bottom: number; left: number} {
  const all = px(style.padding, 0)
  const x = px(style.paddingX, all)
  const y = px(style.paddingY, all)
  return {
    top: px(style.paddingTop, y),
    right: px(style.paddingRight, x),
    bottom: px(style.paddingBottom, y),
    left: px(style.paddingLeft, x),
  }
}

export function textMaterial(surface: UiSurface, color: CssColor | undefined): TextMaterial {
  if (color === undefined) return surface.materials.text
  if (color === "text" || color === "muted" || color === "cyan" || color === "green" || color === "orange" || color === "red" || color === "blue" || color === "violet") {
    const key = color as "text" | "muted" | "cyan" | "green" | "orange" | "red" | "blue" | "violet"
    return surface.materials[key]
  }
  const parsed = cssColor(color)
  const key = `${parsed.r}:${parsed.g}:${parsed.b}:${parsed.a}`
  let material = textMaterialCache.get(key)
  if (material === undefined) {
    material = new TextMaterial({color: parsed})
    textMaterialCache.set(key, material)
  }
  return material
}

function hexColor(hex: string): Color {
  const raw = hex.slice(1)
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(n)) return palette.text
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return new Color(r / 255, g / 255, b / 255, 1)
}

function rgbColor(value: string): Color {
  const nums = value.match(/[\d.]+/g)?.map(Number) ?? []
  if (nums.length < 3) return palette.text
  return new Color((nums[0] ?? 0) / 255, (nums[1] ?? 0) / 255, (nums[2] ?? 0) / 255, nums[3] ?? 1)
}
