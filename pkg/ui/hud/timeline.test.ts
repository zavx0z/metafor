import {describe, expect, test} from "bun:test"
import {planHudTimeline, type HudTimelineDocument} from "./timeline.ts"

const document: HudTimelineDocument = {
  title: "Время · read-only fixture",
  minTick: 0,
  maxTick: 10,
  playheadTick: 6,
  tracks: [
    {
      id: "force",
      label: "Force",
      markers: [
        {tick: 2, resolution: "exact"},
        {tick: 6, resolution: "exact", selected: true},
      ],
    },
    {
      id: "mass",
      label: "Mass",
      markers: [{tick: 1, resolution: "unknown"}],
      intervals: [{fromTick: 3, toTick: 8, resolution: "coarse"}],
    },
  ],
}

describe("HUD timeline plan", () => {
  test("keeps exact markers, coarse intervals, and playhead in one bounded projection", () => {
    const plan = planHudTimeline(document, {x: 20, y: 30, w: 800, h: 180})
    expect(plan.tracks).toHaveLength(2)
    expect(plan.tracks[0]?.markers.map((marker) => marker.x)).toEqual([
      plan.plot.x + plan.plot.w * 0.2,
      plan.plot.x + plan.plot.w * 0.6,
    ])
    expect(plan.tracks[1]?.intervals[0]?.rect.w).toBeCloseTo(plan.plot.w * 0.5)
    expect(plan.playheadX).toBeCloseTo(plan.plot.x + plan.plot.w * 0.6)
  })

  test("rejects an empty or inverted time range", () => {
    expect(() => planHudTimeline({...document, maxTick: 0}, {x: 0, y: 0, w: 1, h: 1}))
      .toThrow("maxTick greater than minTick")
  })
})
