import {Color} from "@metafor/engine"
import {Z, palette, type UiSurface} from "@ui/elements"

export type HudTimelineResolution = "exact" | "coarse" | "unknown"

export type HudTimelineMarker = {
  tick: number
  resolution: Exclude<HudTimelineResolution, "coarse">
  label?: string
  selected?: boolean
}

export type HudTimelineInterval = {
  fromTick: number
  toTick: number
  resolution: "coarse"
  label?: string
}

export type HudTimelineTrack = {
  id: string
  label: string
  markers: readonly HudTimelineMarker[]
  intervals?: readonly HudTimelineInterval[]
}

/** Closed observer projection. It carries no commands or runtime handles. */
export type HudTimelineDocument = {
  title: string
  minTick: number
  maxTick: number
  playheadTick: number
  tracks: readonly HudTimelineTrack[]
}

export type HudTimelineRect = {x: number; y: number; w: number; h: number}
export type HudTimelineMarkerLayout = {marker: HudTimelineMarker; x: number; y: number}
export type HudTimelineIntervalLayout = {interval: HudTimelineInterval; rect: HudTimelineRect}
export type HudTimelineTrackLayout = {
  track: HudTimelineTrack
  y: number
  markers: readonly HudTimelineMarkerLayout[]
  intervals: readonly HudTimelineIntervalLayout[]
}
export type HudTimelinePlan = {
  plot: HudTimelineRect
  playheadX: number
  tracks: readonly HudTimelineTrackLayout[]
}

const HEADER_H = 34
const LABEL_W = 96
const PANEL_PAD = 12
const TRACK_MIN_H = 26

export function planHudTimeline(document: HudTimelineDocument, bounds: HudTimelineRect): HudTimelinePlan {
  if (!Number.isFinite(document.minTick) || !Number.isFinite(document.maxTick) || document.maxTick <= document.minTick) {
    throw new Error("HUD timeline requires maxTick greater than minTick")
  }
  if (document.tracks.length === 0) throw new Error("HUD timeline requires at least one track")
  const plot = {
    x: bounds.x + Math.min(LABEL_W, Math.max(54, bounds.w * 0.18)),
    y: bounds.y + HEADER_H,
    w: Math.max(1, bounds.w - Math.min(LABEL_W, Math.max(54, bounds.w * 0.18)) - PANEL_PAD),
    h: Math.max(1, bounds.h - HEADER_H - PANEL_PAD),
  }
  const trackH = Math.max(TRACK_MIN_H, plot.h / document.tracks.length)
  const xForTick = (tick: number): number => {
    const progress = (clamp(tick, document.minTick, document.maxTick) - document.minTick)
      / (document.maxTick - document.minTick)
    return plot.x + plot.w * progress
  }
  const tracks = document.tracks.map((track, index): HudTimelineTrackLayout => {
    const y = plot.y + Math.min(plot.h, trackH * (index + 0.5))
    return {
      track,
      y,
      markers: track.markers.map((marker) => ({marker, x: xForTick(marker.tick), y})),
      intervals: (track.intervals ?? []).map((interval) => ({
        interval,
        rect: {
          x: xForTick(interval.fromTick),
          y: y - 8,
          w: Math.max(2, xForTick(interval.toTick) - xForTick(interval.fromTick)),
          h: 16,
        },
      })),
    }
  })
  return {
    plot,
    playheadX: xForTick(document.playheadTick),
    tracks,
  }
}

/** Draws a compact Blender-like read-only timeline. */
export function HudTimelinePanel(
  host: UiSurface,
  document: HudTimelineDocument,
  bounds: HudTimelineRect,
  z = Z.ELEMENT,
): HudTimelinePlan {
  const plan = planHudTimeline(document, bounds)
  host.drawText(document.title, bounds.x + PANEL_PAD, bounds.y + 12, {
    fontPx: 12,
    material: host.materials.text,
    maxWidthPx: Math.max(1, bounds.w - 150),
    z: z + 0.08,
  })
  host.drawText(`такт ${document.playheadTick}`, bounds.x + bounds.w - 78, bounds.y + 12, {
    fontPx: 10,
    material: host.materials.red,
    maxWidthPx: 68,
    z: z + 0.08,
  })

  for (const layout of plan.tracks) {
    host.drawText(layout.track.label, bounds.x + PANEL_PAD, layout.y - 5, {
      fontPx: 10,
      material: host.materials.muted,
      maxWidthPx: Math.max(1, plan.plot.x - bounds.x - PANEL_PAD * 2),
      z: z + 0.08,
    })
    host.drawLine(plan.plot.x, layout.y, plan.plot.x + plan.plot.w, layout.y, palette.borderDim, 1, z)
    for (const interval of layout.intervals) {
      host.drawRoundedRect(interval.rect.x, interval.rect.y, interval.rect.w, interval.rect.h, {
        radius: 6,
        fill: palette.pausedFill,
        border: palette.orange,
        borderWidth: 1,
        opacity: 0.72,
        z: z + 0.02,
      })
    }
    for (const marker of layout.markers) {
      drawMarker(host, marker.x, marker.y, markerColor(marker.marker), marker.marker.selected === true, z + 0.05)
    }
  }

  host.drawLine(
    plan.playheadX,
    plan.plot.y - 5,
    plan.playheadX,
    plan.plot.y + plan.plot.h,
    palette.red,
    1.5,
    z + 0.12,
  )
  return plan
}

function drawMarker(host: UiSurface, x: number, y: number, color: Color, selected: boolean, z: number): void {
  const radius = selected ? 6 : 4.5
  host.drawLine(x, y - radius, x + radius, y, color, selected ? 2 : 1.4, z)
  host.drawLine(x + radius, y, x, y + radius, color, selected ? 2 : 1.4, z)
  host.drawLine(x, y + radius, x - radius, y, color, selected ? 2 : 1.4, z)
  host.drawLine(x - radius, y, x, y - radius, color, selected ? 2 : 1.4, z)
}

function markerColor(marker: HudTimelineMarker): Color {
  if (marker.selected === true) return palette.red
  if (marker.resolution === "exact") return palette.green
  return palette.muted
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
