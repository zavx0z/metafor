import {Color, type TextMaterial} from "@metafor/engine"
import {type Card, type HitOptions, Z} from "./card.ts"
import {palette} from "./theme.ts"

export type CssLength = number | `${number}px` | `${number}%` | `${number}fr` | "auto" | "grow"
export type CssColor = Color | keyof typeof palette | `#${string}` | `rgb(${string})` | `rgba(${string})` | "transparent"
export type CssDisplay = "block" | "inline" | "flex" | "none"
export type CssAlignItems = "start" | "center" | "end" | "stretch"
export type CssJustifyContent = "start" | "center" | "end" | "space-between" | "space-around"
export type CssCursor = "default" | "pointer" | "text"

export type SxProps = {
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
  display?: CssDisplay
  alignItems?: CssAlignItems
  justifyContent?: CssJustifyContent
  opacity?: number
  zIndex?: number
}

export type ElementChildren = string | number | false | null | undefined | (() => void)

export type HtmlElementProps = {
  children?: ElementChildren
  key?: string
  sx?: SxProps
  style?: SxProps
  disabled?: boolean
  title?: string
  onClick?: () => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onPointerDown?: () => void
  onPointerUp?: () => void
}

const visionGlass = new Color(0.055, 0.075, 0.11, 0.58)
const visionBorder = new Color(0.82, 0.91, 1, 0.22)

export function div(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps = {}): void {
  const sx = mergeStyle(props)
  if (sx.display === "none" || width <= 0 || height <= 0) return
  const fill = backgroundColor(sx)
  const border = sx.borderColor === null ? null : sx.borderColor === undefined ? undefined : cssColor(sx.borderColor)
  const borderWidth = px(sx.borderWidth, 1)
  const radius = px(sx.borderRadius, Math.min(32, Math.min(width, height) / 2))
  const z = sx.zIndex ?? Z.ELEMENT

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
    if (sx.opacity !== undefined) roundedOpts.opacity = sx.opacity
    card.drawRoundedRect(x, y, width, height, roundedOpts)
  }

  if (
    props.onClick !== undefined ||
    props.title !== undefined ||
    props.onPointerEnter !== undefined ||
    props.onPointerLeave !== undefined ||
    props.onPointerDown !== undefined ||
    props.onPointerUp !== undefined
  ) {
    const hit: HitOptions = {
      cursor: props.disabled === true ? "default" : "pointer",
      disabled: props.disabled === true,
    }
    if (props.title !== undefined) hit.tooltip = {label: props.title, delayMs: 450}
    if (props.key !== undefined) hit.key = props.key
    if (props.onPointerEnter !== undefined) hit.onPointerEnter = props.onPointerEnter
    if (props.onPointerLeave !== undefined) hit.onPointerLeave = props.onPointerLeave
    if (props.onPointerDown !== undefined) hit.onPointerDown = props.onPointerDown
    if (props.onPointerUp !== undefined) hit.onPointerUp = props.onPointerUp
    card.hit(x, y, width, height, props.onClick ?? (() => {}), hit)
    if (props.title !== undefined) card.drawTooltipForHit(x, y, width, height, props.title)
  }

  if (typeof props.children === "function") props.children()
  else if (props.children !== false && props.children !== null && props.children !== undefined) {
    const pad = boxPadding(sx)
    const childProps: HtmlElementProps = {
      children: String(props.children),
      sx,
    }
    if (props.disabled !== undefined) childProps.disabled = props.disabled
    span(card, x + pad.left, y + pad.top, width - pad.left - pad.right, height - pad.top - pad.bottom, childProps)
  }
}

export function span(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps = {}): void {
  if (props.children === false || props.children === null || props.children === undefined) return
  if (typeof props.children === "function") {
    props.children()
    return
  }
  const sx = mergeStyle(props)
  const fontSize = px(sx.fontSize, 12)
  const material = textMaterial(card, sx.color, props.disabled === true)
  card.drawText(String(props.children), x, y + Math.max(0, (height - fontSize) / 2), {
    fontPx: fontSize,
    material,
    maxWidthPx: width,
  })
}

export function p(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps = {}): void {
  span(card, x, y, width, height, {...props, sx: {...props.sx, fontSize: props.sx?.fontSize ?? 12, color: props.sx?.color ?? "text"}})
}

export function h1(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps = {}): void {
  span(card, x, y, width, height, {...props, sx: {...props.sx, fontSize: props.sx?.fontSize ?? 22, color: props.sx?.color ?? "cyan"}})
}

export function h2(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps = {}): void {
  span(card, x, y, width, height, {...props, sx: {...props.sx, fontSize: props.sx?.fontSize ?? 16, color: props.sx?.color ?? "cyan"}})
}

export function h3(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps = {}): void {
  span(card, x, y, width, height, {...props, sx: {...props.sx, fontSize: props.sx?.fontSize ?? 13, color: props.sx?.color ?? "cyan"}})
}

export function h4(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps = {}): void {
  h3(card, x, y, width, height, props)
}

export function h5(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps = {}): void {
  h3(card, x, y, width, height, props)
}

export function h6(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps = {}): void {
  h3(card, x, y, width, height, props)
}

export function hr(card: Card, x: number, y: number, width: number, props: HtmlElementProps = {}): void {
  const sx = mergeStyle(props)
  const thickness = px(sx.height ?? sx.borderWidth, 1)
  const color = sx.backgroundColor ?? sx.background ?? sx.color ?? "borderDim"
  card.drawRect(x, Math.round(y - thickness / 2), width, thickness, color === "glass" ? visionBorder : cssColor(color), sx.zIndex ?? Z.SEPARATOR)
}

export function img(
  card: Card,
  x: number,
  y: number,
  width: number,
  height: number,
  props: HtmlElementProps & {src: string; fit?: "cover" | "contain"} ,
): void {
  const imageOpts: {fit: "cover" | "contain"; opacity?: number} = {fit: props.fit ?? "contain"}
  if (props.sx?.opacity !== undefined) imageOpts.opacity = props.sx.opacity
  card.drawImage(props.src, x, y, width, height, imageOpts)
}

export function button(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps = {}): void {
  const sx = mergeStyle(props)
  const hit = card.hitState(x, y, width, height)
  const state = props.disabled === true ? "disabled" : hit.pressed ? "active" : hit.hovered ? "hover" : "idle"
  const border = state === "disabled" ? "borderDim" : state === "idle" ? "border" : "cyan"
  const fill = state === "disabled" ? "bgPanelDim" : "glass"
  div(card, x, y + (state === "active" ? 1 : 0), width, height - (state === "active" ? 1 : 0), {
    ...props,
    key: props.key ?? `button:${x}:${y}:${width}:${height}`,
    sx: {
      ...sx,
      background: sx.background ?? fill,
      borderColor: sx.borderColor ?? border,
      borderRadius: sx.borderRadius ?? 999,
      color: sx.color ?? (state === "disabled" ? "muted" : "text"),
      fontSize: sx.fontSize ?? 12,
    },
  })
}

export function input(card: Card, x: number, y: number, width: number, height: number, props: HtmlElementProps & {value?: string; active?: boolean}): void {
  div(card, x, y, width, height, {
    ...props,
    children: props.value ?? "",
    sx: {
      ...props.sx,
      background: props.active === true ? "bgHot" : "bgInput",
      borderColor: props.active === true ? "cyan" : "borderDim",
      borderRadius: props.sx?.borderRadius ?? 999,
      color: props.active === true ? "text" : "muted",
      fontSize: props.sx?.fontSize ?? 12,
      paddingX: props.sx?.paddingX ?? 10,
    },
  })
}

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

function mergeStyle(props: HtmlElementProps): SxProps {
  return {...props.style, ...props.sx}
}

function backgroundColor(sx: SxProps): Color | null {
  const value = sx.backgroundColor ?? sx.background ?? "glass"
  if (value === null) return null
  if (value === "glass") return visionGlass
  return cssColor(value)
}

function boxPadding(sx: SxProps): {top: number; right: number; bottom: number; left: number} {
  const all = px(sx.padding, 0)
  const x = px(sx.paddingX, all)
  const y = px(sx.paddingY, all)
  return {
    top: px(sx.paddingTop, y),
    right: px(sx.paddingRight, x),
    bottom: px(sx.paddingBottom, y),
    left: px(sx.paddingLeft, x),
  }
}

function textMaterial(card: Card, color: CssColor | undefined, disabled: boolean): TextMaterial {
  if (disabled) return card.materials.muted
  if (color === undefined) return card.materials.text
  if (color === "text" || color === "muted" || color === "cyan" || color === "green" || color === "orange" || color === "red" || color === "blue" || color === "violet") {
    const key = color as "text" | "muted" | "cyan" | "green" | "orange" | "red" | "blue" | "violet"
    return card.materials[key]
  }
  return card.materials.text
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
