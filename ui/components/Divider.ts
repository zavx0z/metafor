import {divider as renderDivider} from "./internal/renderers.ts"
import {palette, type Pane} from "@metafor/elements"
import type {Color} from "@metafor/engine"

export type DividerColor = "primary" | "neutral" | "success" | "warning" | "error" | Color

export type DividerProps = {
  orientation?: "horizontal"
  color?: DividerColor
  thickness?: number
  z?: number
}

export function Divider(host: Pane, x: number, y: number, width: number, props: DividerProps = {}): void {
  const opts: {color: Color; thickness?: number; z?: number} = {
    color: resolveColor(props.color ?? "neutral"),
  }
  if (props.thickness !== undefined) opts.thickness = props.thickness
  if (props.z !== undefined) opts.z = props.z
  renderDivider(host, x, y, width, opts)
}

function resolveColor(color: DividerColor): Color {
  if (typeof color !== "string") return color
  if (color === "primary") return palette.cyan
  if (color === "success") return palette.green
  if (color === "warning") return palette.orange
  if (color === "error") return palette.red
  return palette.borderDim
}
