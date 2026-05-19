import {
  badge as renderBadge,
  statusChip as renderStatusChip,
  type BadgeOpts as RenderBadgeOpts,
  type StatusChipOpts,
} from "./internal/renderers.ts"
import type {Card, SxProps, Tone} from "@metafor/elements"

export type BadgeColor = "primary" | "neutral" | "success" | "warning" | "error"
export type BadgeProps = {
  children?: string
  label?: string
  color?: BadgeColor
  tone?: Tone
  fontPx?: number
  sx?: SxProps
}

export function Badge(host: Card, x: number, y: number, width: number, height: number, props: BadgeProps): void {
  const opts: RenderBadgeOpts = {
    label: props.label ?? props.children ?? "",
    tone: props.tone ?? toneFromColor(props.color ?? "neutral"),
  }
  const fontPx = props.fontPx ?? (props.sx?.fontSize === undefined ? undefined : Number(props.sx.fontSize))
  if (fontPx !== undefined) opts.fontPx = fontPx
  renderBadge(host, x, y, width, height, opts)
}

export function StatusChip(host: Card, x: number, y: number, width: number, height: number, props: StatusChipOpts): void {
  renderStatusChip(host, x, y, width, height, props)
}

function toneFromColor(color: BadgeColor): Tone {
  if (color === "success") return "live"
  if (color === "warning") return "paused"
  if (color === "error") return "warn"
  return "neutral"
}
