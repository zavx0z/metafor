import {div, h2, Z, type Pane as ElementHost, type StyleProps} from "@metafor/elements"

export type PaneVariant = "glass" | "outlined" | "filled"
export type PaneProps = {
  children?: string
  variant?: PaneVariant
  elevation?: 0 | 1 | 2 | 3
  sx?: StyleProps
}

export function Pane(host: ElementHost, x: number, y: number, width: number, height: number, props: PaneProps = {}): void {
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

export function Paper(host: ElementHost, x: number, y: number, width: number, height: number, props: PaneProps = {}): void {
  Pane(host, x, y, width, height, props)
}

export function PaneTitle(host: ElementHost, x: number, y: number, width: number, height: number, label: string): void {
  h2(host, x, y, width, height, {children: label, style: {color: "cyan", fontSize: 14}})
}
