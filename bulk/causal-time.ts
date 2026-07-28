import type {
  BulkTimeFrame,
  BulkTimeFrameResolution,
  BulkTimeFrameTone,
} from "@metafor/types/bulk/hud"
import type {UiSurfaceRect} from "@ui/elements"

export const BULK_TIME_TRACKS = ["Force", "Mass", "Boundary"] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isResolution = (value: unknown): value is BulkTimeFrameResolution =>
  value === "exact" || value === "degraded" || value === "overloaded"

export const readBulkTimeFrames = (value: unknown): BulkTimeFrame[] => {
  if (!Array.isArray(value)) throw new Error("Dark returned an invalid causal stack")
  return value.map((candidate) => {
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
}

export const bulkTimeFramePosition = (
  frame: BulkTimeFrame,
  frames: readonly BulkTimeFrame[],
): number => {
  const first = frames[0]?.frontier.acceptanceSequence ?? 0
  const last = frames.at(-1)?.frontier.acceptanceSequence ?? first
  if (last === first) return 0.5
  return Math.max(
    0,
    Math.min(1, (frame.frontier.acceptanceSequence - first) / (last - first)),
  )
}

export const bulkTimeFrameTone = (
  frame: BulkTimeFrame,
  selected: boolean,
): BulkTimeFrameTone => selected ? "selected" : frame.resolution ?? "unknown"

export const bulkTimeSurfaceRect = (
  bounds: {w: number; h: number},
  active: boolean,
  observerTimeline: UiSurfaceRect,
): UiSurfaceRect => {
  if (!active) return {x: -1, y: -1, w: 0, h: 0}
  const height = Math.min(
    Math.max(0, bounds.h),
    Math.min(192, Math.max(148, Math.round(bounds.h * 0.24))),
  )
  const x = Math.max(0, Math.min(bounds.w, observerTimeline.x))
  const width = Math.max(0, Math.min(bounds.w - x, observerTimeline.w))
  const y = Math.max(0, Math.min(bounds.h - height, observerTimeline.y - height - 12))
  return {x, y, w: width, h: height}
}
