import type {
  BulkTimeFrame,
  BulkTimeFrameResolution,
} from "@metafor/types/bulk/hud"
import type {UiSurfaceRect} from "@ui/elements"
import type {HudTimelineDocument, HudTimelineMarker} from "@ui/hud"

export const BULK_TIME_TRACKS = ["Force", "Mass", "Boundary"] as const

const HIDDEN_SURFACE: UiSurfaceRect = {x: -1, y: -1, w: 0, h: 0}
const VIEWPORT_TOP_GUARD = 42
const VIEWPORT_SIDE_MARGIN_MIN = 18
const VIEWPORT_SIDE_MARGIN_MAX = 52
const CONTROL_DOCK_WIDTH = 292
const CONTROL_DOCK_MIN_WIDTH = 122
const CONTROL_DOCK_HEIGHT = 38
const CONTROL_DOCK_MARGIN = 12
const CONTROL_DOCK_GAP = 4
const TIMELINE_SURFACE_HEIGHT = 56

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isResolution = (value: unknown): value is BulkTimeFrameResolution =>
  value === "exact" || value === "degraded" || value === "overloaded"

export const readBulkTimeFrames = (value: unknown): BulkTimeFrame[] => {
  if (!Array.isArray(value)) throw new Error("Dark returned an invalid causal stack")
  const frames = value.map((candidate) => {
    if (
      !isRecord(candidate) ||
      !Number.isSafeInteger(candidate.id) ||
      (candidate.id as number) <= 0 ||
      !isRecord(candidate.frontier)
    ) {
      throw new Error("Dark returned an invalid causal frame")
    }
    const acceptanceSequence = candidate.frontier.acceptanceSequence
    if (
      !Number.isSafeInteger(acceptanceSequence) ||
      (acceptanceSequence as number) < 0
    ) {
      throw new Error("Dark returned a causal frame without a valid acceptance sequence")
    }
    const resolution = candidate.resolution
    if (resolution !== undefined && !isResolution(resolution)) {
      throw new Error("Dark returned a causal frame with an invalid resolution")
    }
    return {
      id: candidate.id as number,
      frontier: {acceptanceSequence: acceptanceSequence as number},
      ...(resolution === undefined ? {} : {resolution}),
    }
  })
  for (const [index, frame] of frames.entries()) {
    if (frame.id !== index + 1) {
      throw new Error("Dark returned a causal stack with non-sequential frame identity")
    }
    const previous = frames[index - 1]
    if (
      previous !== undefined &&
      frame.frontier.acceptanceSequence <= previous.frontier.acceptanceSequence
    ) {
      throw new Error("Dark returned a causal stack with non-increasing acceptance sequence")
    }
  }
  return frames
}

export const buildBulkCausalTimeline = (
  frames: readonly BulkTimeFrame[],
  playhead: number,
): HudTimelineDocument => {
  const range = causalTimelineRange(frames)
  const playheadTick = range.span === 0
    ? range.first
    : range.first + range.span * clamp(playhead, 0, 1)
  const selectedIndex = nearestFrameIndex(frames, playheadTick)
  const markers: HudTimelineMarker[] = frames.map((frame, index) => ({
    tick: frame.frontier.acceptanceSequence,
    resolution: frame.resolution ?? "unknown",
    selected: index === selectedIndex,
    label: `frame ${frame.id}`,
  }))

  return {
    title: "ВРЕМЯ · causal stack",
    minTick: range.min,
    maxTick: range.max,
    playheadTick,
    playheadLabel: `seq ${formatSequence(playheadTick)}`,
    tracks: BULK_TIME_TRACKS.map((label) => ({
      id: `causal:${label.toLowerCase()}`,
      label,
      markers,
    })),
  }
}

export const bulkTimePlayheadFromPlot = (
  frames: readonly BulkTimeFrame[],
  plotPosition: number,
): number => {
  const range = causalTimelineRange(frames)
  if (range.span === 0) return frames.length === 0 ? 0 : 1
  const tick = range.min + (range.max - range.min) * clamp(plotPosition, 0, 1)
  return clamp((tick - range.first) / range.span, 0, 1)
}

export const bulkTimeSurfaceRect = (
  bounds: {w: number; h: number},
  active: boolean,
): UiSurfaceRect => {
  if (!active) return HIDDEN_SURFACE
  const viewportWidth = Math.max(0, bounds.w)
  const viewportHeight = Math.max(0, bounds.h)
  const margin = Math.min(
    VIEWPORT_SIDE_MARGIN_MAX,
    Math.max(VIEWPORT_SIDE_MARGIN_MIN, Math.floor(viewportWidth * 0.035)),
  )
  const x = Math.min(viewportWidth, margin)
  const width = Math.max(0, viewportWidth - x * 2)
  const dock = bulkTimeControlDockRect(bounds, active)
  const bottom = Math.max(0, dock.y - CONTROL_DOCK_GAP)
  const topGuard = bottom >= VIEWPORT_TOP_GUARD ? VIEWPORT_TOP_GUARD : 0
  const availableHeight = Math.max(0, bottom - topGuard)
  if (availableHeight < TIMELINE_SURFACE_HEIGHT) return HIDDEN_SURFACE
  const height = TIMELINE_SURFACE_HEIGHT
  return {
    x,
    y: Math.max(topGuard, bottom - height),
    w: width,
    h: height,
  }
}

export const bulkTimeControlDockRect = (
  bounds: {w: number; h: number},
  active: boolean,
): UiSurfaceRect => {
  if (!active) return HIDDEN_SURFACE
  const viewportWidth = Math.max(0, bounds.w)
  const viewportHeight = Math.max(0, bounds.h)
  const width = Math.min(CONTROL_DOCK_WIDTH, Math.max(0, viewportWidth - 16))
  if (width < CONTROL_DOCK_MIN_WIDTH) return HIDDEN_SURFACE
  const height = Math.min(CONTROL_DOCK_HEIGHT, viewportHeight)
  const y = Math.max(0, viewportHeight - height - Math.min(CONTROL_DOCK_MARGIN, viewportHeight - height))
  return {
    x: Math.max(0, Math.floor((viewportWidth - width) / 2)),
    y,
    w: width,
    h: height,
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const formatSequence = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2)

const causalTimelineRange = (frames: readonly BulkTimeFrame[]): {
  first: number
  last: number
  span: number
  min: number
  max: number
} => {
  const first = frames[0]?.frontier.acceptanceSequence ?? 0
  const last = frames.at(-1)?.frontier.acceptanceSequence ?? first
  const span = last - first
  const padding = Math.max(1, span * 0.06)
  return {
    first,
    last,
    span,
    min: first - padding,
    max: last + padding,
  }
}

const nearestFrameIndex = (
  frames: readonly BulkTimeFrame[],
  tick: number,
): number => {
  let selected = -1
  let distance = Number.POSITIVE_INFINITY
  for (const [index, frame] of frames.entries()) {
    const nextDistance = Math.abs(frame.frontier.acceptanceSequence - tick)
    if (nextDistance < distance) {
      selected = index
      distance = nextDistance
    }
  }
  return selected
}
