import {div, h2, Z, type Card as ElementHost, type StyleProps} from "@metafor/elements"

export type CardVariant = "glass" | "outlined" | "filled"
export type CardProps = {
  children?: string
  variant?: CardVariant
  elevation?: 0 | 1 | 2 | 3
  sx?: StyleProps
}

export function Card(host: ElementHost, x: number, y: number, width: number, height: number, props: CardProps = {}): void {
  div(host, x, y, width, height, {
    children: props.children,
    style: {
      background: props.variant === "filled" ? "bgElevated" : "glass",
      borderColor: props.variant === "outlined" ? "borderBright" : "borderDim",
      borderRadius: 30,
      padding: 20,
      zIndex: Z.CONTAINER,
      ...props.sx,
    },
  })
}

export function Paper(host: ElementHost, x: number, y: number, width: number, height: number, props: CardProps = {}): void {
  Card(host, x, y, width, height, props)
}

export function CardTitle(host: ElementHost, x: number, y: number, width: number, height: number, label: string): void {
  h2(host, x, y, width, height, {children: label, style: {color: "cyan", fontSize: 14}})
}
