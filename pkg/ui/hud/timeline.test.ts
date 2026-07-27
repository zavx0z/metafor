import {describe, expect, test} from "bun:test"
import {planHudTimeline, type HudTimelineDocument} from "./timeline.ts"

const document: HudTimelineDocument = {
  title: "Inference · current observer cut",
  minTick: 4,
  maxTick: 6,
  playheadTick: 5,
  tracks: [
    {
      id: "atom:1",
      label: "inference",
      markers: [{tick: 5, resolution: "exact", selected: true}],
    },
    {
      id: "atom:2",
      label: "lada",
      markers: [{tick: 5, resolution: "exact", selected: true}],
    },
  ],
}

describe("HUD timeline plan", () => {
  test("keeps exact current-cut markers and playhead in one bounded projection", () => {
    const plan = planHudTimeline(document, {x: 20, y: 30, w: 800, h: 180})
    expect(plan.tracks).toHaveLength(2)
    expect(plan.tracks[0]?.markers[0]?.x).toBeCloseTo(plan.plot.x + plan.plot.w * 0.5)
    expect(plan.tracks[1]?.markers[0]?.x).toBeCloseTo(plan.plot.x + plan.plot.w * 0.5)
    expect(plan.playheadX).toBeCloseTo(plan.plot.x + plan.plot.w * 0.5)
  })

  test("rejects an empty or inverted time range", () => {
    expect(() => planHudTimeline({...document, maxTick: 4}, {x: 0, y: 0, w: 1, h: 1}))
      .toThrow("maxTick greater than minTick")
  })
})
