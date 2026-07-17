import {
  badge as renderBadge,
  statusChip as renderStatusChip,
  type BadgeOpts as RenderBadgeOpts,
  type StatusChipOpts,
} from "./internal/renderers.ts"
import type {UiSurface, StyleProps, Tone} from "@ui/elements"

export type BadgeColor = "primary" | "neutral" | "success" | "warning" | "error"
export type BadgeProps = {
  children?: string
  label?: string
  color?: BadgeColor
  tone?: Tone
  fontPx?: number
  sx?: StyleProps
}

export function Badge(host: UiSurface, x: number, y: number, width: number, height: number, props: BadgeProps): void {
  const opts: RenderBadgeOpts = {
    label: props.label ?? props.children ?? "",
    tone: props.tone ?? toneFromColor(props.color ?? "neutral"),
  }
  const fontPx = props.fontPx ?? (props.sx?.fontSize === undefined ? undefined : Number(props.sx.fontSize))
  if (fontPx !== undefined) opts.fontPx = fontPx
  renderBadge(host, x, y, width, height, opts)
}

export function StatusChip(host: UiSurface, x: number, y: number, width: number, height: number, props: StatusChipOpts): void {
  renderStatusChip(host, x, y, width, height, props)
}

function toneFromColor(color: BadgeColor): Tone {
  if (color === "success") return "live"
  if (color === "warning") return "paused"
  if (color === "error") return "warn"
  return "neutral"
}
