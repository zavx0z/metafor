import type {UiSurface} from "./surface.ts"
import {div, type DivProps} from "./div.ts"
import {mergeStyle} from "./style.ts"

export type InputProps = DivProps & {value?: string; active?: boolean}

export function input(surface: UiSurface, x: number, y: number, width: number, height: number, props: InputProps): void {
  const style = mergeStyle(props)
  div(surface, x, y, width, height, {
    ...props,
    children: props.value ?? "",
    style: {
      ...style,
      background: props.active === true ? "bgHot" : "bgInput",
      borderColor: props.active === true ? "cyan" : "borderDim",
      borderRadius: style.borderRadius ?? 999,
      color: props.active === true ? "text" : "muted",
      fontSize: style.fontSize ?? 12,
      paddingX: style.paddingX ?? 10,
    },
  })
}
