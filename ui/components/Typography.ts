import {span, type CssColor, type StyleProps, type UiSurface} from "@metafor/elements"

export type TypographyVariant = "title" | "subtitle" | "body" | "caption"

export type TypographyProps = {
  children?: string | number
  color?: CssColor
  fontPx?: number
  variant?: TypographyVariant
  sx?: StyleProps
}

export function Typography(host: UiSurface, x: number, y: number, width: number, height: number, props: TypographyProps = {}): void {
  const variant = props.variant ?? "body"
  const style: StyleProps = {
    color: props.color ?? defaultColor(variant),
    fontSize: props.fontPx ?? defaultFontPx(variant),
    ...props.sx,
  }
  span(host, x, y, width, height, {
    children: props.children ?? "",
    style,
  })
}

function defaultFontPx(variant: TypographyVariant): number {
  if (variant === "title") return 14
  if (variant === "subtitle") return 13
  if (variant === "caption") return 11
  return 12
}

function defaultColor(variant: TypographyVariant): CssColor {
  if (variant === "title") return "cyan"
  if (variant === "caption") return "muted"
  return "text"
}
