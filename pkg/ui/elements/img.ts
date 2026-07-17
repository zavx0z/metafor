import type {UiSurface} from "./surface.ts"
import {mergeStyle, type ElementBaseProps} from "./style.ts"

export type ImgProps = ElementBaseProps & {src: string; fit?: "cover" | "contain"}

export function img(surface: UiSurface, x: number, y: number, width: number, height: number, props: ImgProps): void {
  const imageOpts: {fit: "cover" | "contain"; opacity?: number} = {fit: props.fit ?? "contain"}
  const style = mergeStyle(props)
  if (style.opacity !== undefined) imageOpts.opacity = style.opacity
  surface.drawImage(props.src, x, y, width, height, imageOpts)
}
