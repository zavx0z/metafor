import {Color} from "@metafor/engine"
import {Z, type UiSurface} from "./surface.ts"
import {palette} from "./theme.ts"

export type ScrollbarOpts = {
  /** Current scroll offset in px. */
  offset: number
  /** Visible viewport size in px along the scroll axis. */
  visible: number
  /** Total scrollable content size in px along the scroll axis. */
  total: number
  /** Scroll axis. Default: vertical. */
  axis?: "vertical" | "horizontal"
  /** @deprecated Использовать axis. Оставлено для совместимости с ранним elements API. */
  orientation?: "vertical" | "horizontal"
  /** Track thickness in px. Default 4. */
  trackWidth?: number
  /** Minimum thumb length in px. Default 16. */
  minThumbHeight?: number
  trackColor?: Color
  thumbColor?: Color
  thumbWidth?: number
}

const DEFAULT_THUMB = new Color(0.45, 0.51, 0.60, 0.62)
export const DEFAULT_ACTIVE_THUMB = new Color(0.56, 0.65, 0.76, 0.86)

export function scrollbarThumbCross(trackWidth: number, thumbWidth?: number): number {
  return Math.min(trackWidth, thumbWidth ?? Math.max(3, trackWidth - 2))
}

export function scrollbar(surface: UiSurface, x: number, y: number, h: number, opts: ScrollbarOpts): void {
  if (opts.total <= opts.visible) return
  const axis = opts.axis ?? opts.orientation ?? "vertical"
  const tw = opts.trackWidth ?? 4
  const minThumb = opts.minThumbHeight ?? 16
  const trackColor = opts.trackColor ?? palette.borderDim
  const thumbColor = opts.thumbColor ?? DEFAULT_THUMB
  const thumbCross = scrollbarThumbCross(tw, opts.thumbWidth)
  const crossOffset = (tw - thumbCross) / 2

  const trackX = axis === "horizontal" ? x : x + crossOffset
  const trackY = axis === "horizontal" ? y + crossOffset : y
  const trackW = axis === "horizontal" ? h : thumbCross
  const trackH = axis === "horizontal" ? thumbCross : h
  surface.drawRoundedRect(trackX, trackY, trackW, trackH, {
    radius: thumbCross / 2,
    fill: trackColor,
    z: Z.SEPARATOR,
  })

  const ratio = opts.visible / opts.total
  const thumbLength = Math.max(minThumb, Math.floor(h * ratio))
  const range = h - thumbLength
  const maxOffset = Math.max(1, opts.total - opts.visible)
  const thumbPos = Math.floor(range * (opts.offset / maxOffset))
  const thumbX = axis === "horizontal" ? x + thumbPos : x + (tw - thumbCross) / 2
  const thumbY = axis === "horizontal" ? y + (tw - thumbCross) / 2 : y + thumbPos
  const thumbW = axis === "horizontal" ? thumbLength : thumbCross
  const thumbH = axis === "horizontal" ? thumbCross : thumbLength
  surface.drawRoundedRect(thumbX, thumbY, thumbW, thumbH, {
    radius: thumbCross / 2,
    fill: thumbColor,
    z: Z.TEXT,
  })
}
