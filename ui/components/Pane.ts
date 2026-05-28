import {div, h2, Z, type DivProps, type UiSurface, type StyleProps} from "@ui/elements"

export type PaneVariant = "glass" | "outlined" | "filled"
export type PaneProps = {
  children?: DivProps["children"]
  key?: string
  variant?: PaneVariant
  elevation?: 0 | 1 | 2 | 3
  scrollContentWidth?: number
  scrollContentHeight?: number
  sx?: StyleProps
}

export function Pane(host: UiSurface, x: number, y: number, width: number, height: number, props: PaneProps = {}): void {
  const divProps: DivProps = {
    children: props.children,
    style: {
      background: props.variant === "filled" ? "bgElevated" : "glass",
      borderColor: props.variant === "outlined" ? "borderBright" : "borderDim",
      borderRadius: 30,
      padding: 20,
      zIndex: Z.CONTAINER,
      ...props.sx,
    },
  }
  if (props.key !== undefined) divProps.key = props.key
  if (props.scrollContentWidth !== undefined) divProps.scrollContentWidth = props.scrollContentWidth
  if (props.scrollContentHeight !== undefined) divProps.scrollContentHeight = props.scrollContentHeight
  div(host, x, y, width, height, {
    ...divProps,
  })
}

export function Paper(host: UiSurface, x: number, y: number, width: number, height: number, props: PaneProps = {}): void {
  Pane(host, x, y, width, height, props)
}

export function PaneTitle(host: UiSurface, x: number, y: number, width: number, height: number, label: string): void {
  h2(host, x, y, width, height, {children: label, style: {color: "cyan", fontSize: 14}})
}
