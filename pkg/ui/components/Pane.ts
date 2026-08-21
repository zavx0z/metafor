import {
  blenderRgba8ToColor,
  blenderTheme,
  div,
  h2,
  resolveWidgetColors,
  uiShapeMetrics,
  Z,
  type DivProps,
  type UiSurface,
  type StyleProps,
} from "@ui/elements"

export type PaneVariant = "glass" | "outlined" | "filled"
export type PaneAppearance = "panel" | "box"
export type PaneProps = {
  children?: DivProps["children"]
  key?: string
  variant?: PaneVariant
  elevation?: 0 | 1 | 2 | 3
  appearance?: PaneAppearance
  active?: boolean
  scrollContentWidth?: number
  scrollContentHeight?: number
  sx?: StyleProps
}

export function Pane(host: UiSurface, x: number, y: number, width: number, height: number, props: PaneProps = {}): void {
  const appearance = paneAppearanceStyle(props)
  const divProps: DivProps = {
    children: props.children,
    style: {
      background: props.variant === "filled" ? "bgElevated" : "glass",
      borderColor: props.variant === "outlined" ? "borderBright" : "borderDim",
      borderRadius: 30,
      padding: 20,
      zIndex: Z.CONTAINER,
      ...appearance,
      ...props.sx,
    },
  }
  if (props.key !== undefined) divProps.key = props.key
  if (props.scrollContentWidth !== undefined) divProps.scrollContentWidth = props.scrollContentWidth
  if (props.scrollContentHeight !== undefined) divProps.scrollContentHeight = props.scrollContentHeight
  div(host, x, y, width, height, {
    ...divProps,
  })
  if (props.appearance === "panel" && props.sx?.borderColor === undefined) {
    div(host, x, y, width, height, {
      style: {
        background: null,
        borderColor: blenderRgba8ToColor(
          props.active === true ? blenderTheme.material.editorOutlineActive : blenderTheme.material.editorOutline,
        ),
        borderRadius: uiShapeMetrics.lowRadius,
        borderWidth: uiShapeMetrics.borderWidth,
        zIndex: (props.sx?.zIndex ?? Z.CONTAINER) + 0.01,
      },
    })
  }
}

function paneAppearanceStyle(props: PaneProps): StyleProps {
  if (props.appearance === "panel") {
    return {
      background: blenderRgba8ToColor(blenderTheme.spaceNode.panel.back),
      borderColor: blenderRgba8ToColor(blenderTheme.material.editorBorder),
      borderRadius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    }
  }
  if (props.appearance === "box") {
    const colors = resolveWidgetColors("box")
    return {
      background: blenderRgba8ToColor(colors.inner),
      borderColor: blenderRgba8ToColor(colors.outline),
      borderRadius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    }
  }
  return {}
}

export function Paper(host: UiSurface, x: number, y: number, width: number, height: number, props: PaneProps = {}): void {
  Pane(host, x, y, width, height, props)
}

export function PaneTitle(host: UiSurface, x: number, y: number, width: number, height: number, label: string): void {
  h2(host, x, y, width, height, {
    children: label,
    style: {color: blenderRgba8ToColor(resolveWidgetColors("box").text), fontSize: 14},
  })
}
