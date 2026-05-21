import {Color} from "@metafor/engine"
import {Z, type UiSurface} from "./surface.ts"
import {palette} from "./theme.ts"

export type ScrollbarOpts = {
  /** Current scroll offset in px. */
  offset: number
  /** Visible viewport height in px. */
  visible: number
  /** Total scrollable content height in px. */
  total: number
  /** Track thickness in px. Default 4. */
  trackWidth?: number
  /** Minimum thumb height in px. Default 16. */
  minThumbHeight?: number
  trackColor?: Color
  thumbColor?: Color
  thumbWidth?: number
}

const DEFAULT_THUMB = new Color(0.45, 0.51, 0.60, 0.62)

export function scrollbar(surface: UiSurface, x: number, y: number, h: number, opts: ScrollbarOpts): void {
  if (opts.total <= opts.visible) return
  const tw = opts.trackWidth ?? 4
  const minThumb = opts.minThumbHeight ?? 16
  const trackColor = opts.trackColor ?? palette.borderDim
  const thumbColor = opts.thumbColor ?? DEFAULT_THUMB

  surface.drawRoundedRect(x, y, tw, h, {
    radius: tw / 2,
    fill: trackColor,
    z: Z.SEPARATOR,
  })

  const ratio = opts.visible / opts.total
  const thumbH = Math.max(minThumb, Math.floor(h * ratio))
  const range = h - thumbH
  const maxOffset = Math.max(1, opts.total - opts.visible)
  const thumbY = y + Math.floor(range * (opts.offset / maxOffset))
  const thumbW = Math.min(tw, opts.thumbWidth ?? Math.max(3, tw - 2))
  const thumbX = x + (tw - thumbW) / 2
  surface.drawRoundedRect(thumbX, thumbY, thumbW, thumbH, {
    radius: thumbW / 2,
    fill: thumbColor,
    z: Z.TEXT,
  })
}
