import type {
  HudTimelineDocument,
  HudTimelineInterval,
  HudTimelineMarker,
  HudTimelineTrack,
} from "@ui/hud"

export type BulkTimelineProjectionPoint = {
  tick: number
  resolution: "exact" | "unknown"
  selected?: boolean
}

export type BulkTimelineProjectionInterval = {
  fromTick: number
  toTick: number
}

export type BulkTimelineProjectionTrack = {
  id: "force" | "mass" | "boundary"
  label: string
  points: readonly BulkTimelineProjectionPoint[]
  coarseIntervals?: readonly BulkTimelineProjectionInterval[]
}

/** Fixture-only projection. It is not canonical history and exposes no writes. */
export type BulkTimelineProjection = {
  minTick: number
  maxTick: number
  playheadTick: number
  tracks: readonly BulkTimelineProjectionTrack[]
}

export function adaptBulkTimelineProjection(projection: BulkTimelineProjection): HudTimelineDocument {
  return {
    title: "Время · read-only fixture",
    minTick: projection.minTick,
    maxTick: projection.maxTick,
    playheadTick: projection.playheadTick,
    tracks: projection.tracks.map((track): HudTimelineTrack => ({
      id: track.id,
      label: track.label,
      markers: track.points.map((point): HudTimelineMarker => ({
        tick: point.tick,
        resolution: point.resolution,
        ...(point.selected === undefined ? {} : {selected: point.selected}),
      })),
      intervals: (track.coarseIntervals ?? []).map((interval): HudTimelineInterval => ({
        fromTick: interval.fromTick,
        toTick: interval.toTick,
        resolution: "coarse",
      })),
    })),
  }
}

export function createBulkTimelineFixtureProjection(): BulkTimelineProjection {
  return {
    minTick: 0,
    maxTick: 12,
    playheadTick: 8,
    tracks: [
      {
        id: "force",
        label: "Force",
        points: [
          {tick: 1, resolution: "exact"},
          {tick: 4, resolution: "exact"},
          {tick: 8, resolution: "exact", selected: true},
        ],
      },
      {
        id: "mass",
        label: "Mass",
        points: [
          {tick: 2, resolution: "exact"},
          {tick: 9, resolution: "unknown"},
        ],
        coarseIntervals: [{fromTick: 3, toTick: 7}],
      },
      {
        id: "boundary",
        label: "Boundary",
        points: [
          {tick: 2, resolution: "exact"},
          {tick: 5, resolution: "exact"},
          {tick: 8, resolution: "exact", selected: true},
        ],
      },
    ],
  }
}
