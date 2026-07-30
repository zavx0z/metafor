import {describe, expect, test} from "bun:test"
import {planHudTimeline, type HudTimelineDocument} from "./timeline.ts"

const document: HudTimelineDocument = {
  title: "ВРЕМЯ · causal stack",
  minTick: 4,
  maxTick: 6,
  playheadTick: 5,
  tracks: [
    {
      id: "causal:force",
      label: "Force",
      markers: [{tick: 5, resolution: "exact", selected: true}],
    },
    {
      id: "causal:mass",
      label: "Mass",
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

  test("accepts causal marker resolutions and a domain playhead label", () => {
    const causal: HudTimelineDocument = {
      ...document,
      playheadLabel: "seq 5",
      tracks: [{
        id: "causal:force",
        label: "Force",
        markers: [
          {tick: 4.5, resolution: "degraded"},
          {tick: 5, resolution: "overloaded"},
        ],
      }],
    }
    const plan = planHudTimeline(causal, {x: 0, y: 0, w: 600, h: 160})
    expect(plan.tracks[0]?.markers.map(({marker}) => marker.resolution)).toEqual([
      "degraded",
      "overloaded",
    ])
  })

  test("fits three Blender-like tracks into the compact headerless Bulk slot", () => {
    const compact = planHudTimeline(
      {
        ...document,
        tracks: [
          ...document.tracks,
          {id: "causal:boundary", label: "Boundary", markers: document.tracks[0]!.markers},
        ],
      },
      {x: 0, y: 0, w: 1116, h: 56},
      {
        showHeader: false,
        labelWidth: 76,
        panelPadding: 4,
        trackMinHeight: 0,
        trackFontPx: 8,
        balanceLabelGutter: true,
      },
    )

    expect(compact.plot).toEqual({x: 76, y: 0, w: 964, h: 56})
    expect(compact.playheadX).toBe(1116 / 2)
    expect(compact.tracks[0]?.y).toBeCloseTo(56 / 6)
    expect(compact.tracks[1]?.y).toBeCloseTo(56 / 2)
    expect(compact.tracks[2]?.y).toBeCloseTo(56 * 5 / 6)
    expect(compact.tracks.every((track) =>
      track.markers.every((marker) => marker.x >= compact.plot.x && marker.x <= compact.plot.x + compact.plot.w)
    )).toBe(true)
  })
})
