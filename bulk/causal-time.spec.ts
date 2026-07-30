import {describe, expect, test} from "bun:test"
import {
  buildBulkCausalTimeline,
  bulkTimeControlDockRect,
  bulkTimePlayheadFromPlot,
  bulkTimeSurfaceRect,
  readBulkTimeFrames,
} from "./causal-time.ts"

describe("Bulk causal timeline", () => {
  test("validates frame identity, acceptance sequence and optional resolution", () => {
    expect(readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 10}, resolution: "exact"},
      {id: 2, frontier: {acceptanceSequence: 15}},
    ])).toEqual([
      {id: 1, frontier: {acceptanceSequence: 10}, resolution: "exact"},
      {id: 2, frontier: {acceptanceSequence: 15}},
    ])
    expect(() => readBulkTimeFrames([{id: 0, frontier: {acceptanceSequence: 10}}]))
      .toThrow("invalid causal frame")
    expect(() => readBulkTimeFrames([{id: 1, frontier: {acceptanceSequence: "10"}}]))
      .toThrow("acceptance sequence")
    expect(() => readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 10}, resolution: "fast"},
    ])).toThrow("invalid resolution")
    expect(() => readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 10}},
      {id: 1, frontier: {acceptanceSequence: 11}},
    ])).toThrow("non-sequential frame identity")
    expect(() => readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 11}},
      {id: 2, frontier: {acceptanceSequence: 10}},
    ])).toThrow("non-increasing acceptance sequence")
    expect(() => readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 11}},
      {id: 2, frontier: {acceptanceSequence: 11}},
    ])).toThrow("non-increasing acceptance sequence")
  })

  test("projects the causal stack into the existing timeline UI", () => {
    const frames = readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 10}, resolution: "exact"},
      {id: 2, frontier: {acceptanceSequence: 20}, resolution: "degraded"},
    ])
    const timeline = buildBulkCausalTimeline(frames, 0.25)

    expect(timeline.title).toBe("ВРЕМЯ · causal stack")
    expect(timeline.playheadTick).toBe(12.5)
    expect(timeline.playheadLabel).toBe("seq 12.50")
    expect(timeline.tracks.map((track) => track.label)).toEqual([
      "Force",
      "Mass",
      "Boundary",
    ])
    expect(timeline.tracks[0]?.markers).toEqual([
      {tick: 10, resolution: "exact", selected: true, label: "frame 1"},
      {tick: 20, resolution: "degraded", selected: false, label: "frame 2"},
    ])
    expect(timeline.tracks[1]?.markers).toBe(timeline.tracks[0]?.markers)
    expect(timeline.tracks[2]?.markers).toBe(timeline.tracks[0]?.markers)
  })

  test("maps padded plot coordinates back to the causal span without playhead jumps", () => {
    const frames = readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 10}},
      {id: 2, frontier: {acceptanceSequence: 20}},
    ])
    const timeline = buildBulkCausalTimeline(frames, 0.5)
    const plotPosition = (tick: number): number =>
      (tick - timeline.minTick) / (timeline.maxTick - timeline.minTick)

    expect(bulkTimePlayheadFromPlot(frames, plotPosition(10))).toBeCloseTo(0)
    expect(bulkTimePlayheadFromPlot(frames, plotPosition(15))).toBeCloseTo(0.5)
    expect(bulkTimePlayheadFromPlot(frames, plotPosition(20))).toBeCloseTo(1)
  })

  test("selects the frame nearest to the playhead rather than always the latest", () => {
    const frames = readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 10}},
      {id: 2, frontier: {acceptanceSequence: 20}},
    ])
    expect(buildBulkCausalTimeline(frames, 0).tracks[0]?.markers)
      .toEqual([
        {tick: 10, resolution: "unknown", selected: true, label: "frame 1"},
        {tick: 20, resolution: "unknown", selected: false, label: "frame 2"},
      ])
  })

  test("keeps an empty causal stack valid without inventing Atom tracks", () => {
    expect(buildBulkCausalTimeline([], 0)).toEqual({
      title: "ВРЕМЯ · causal stack",
      minTick: -1,
      maxTick: 1,
      playheadTick: 0,
      playheadLabel: "seq 0",
      tracks: [
        {id: "causal:force", label: "Force", markers: []},
        {id: "causal:mass", label: "Mass", markers: []},
        {id: "causal:boundary", label: "Boundary", markers: []},
      ],
    })
  })

  test("occupies the lower timeline slot above its separate control dock", () => {
    expect(bulkTimeSurfaceRect(
      {w: 1200, h: 800},
      true,
    )).toEqual({
      x: 42,
      y: 690,
      w: 1116,
      h: 56,
    })
    expect(bulkTimeControlDockRect(
      {w: 1200, h: 800},
      true,
    )).toEqual({
      x: 454,
      y: 750,
      w: 292,
      h: 38,
    })
    expect(bulkTimeControlDockRect(
      {w: 320, h: 100},
      true,
    )).toEqual({
      x: 14,
      y: 50,
      w: 292,
      h: 38,
    })
    expect(bulkTimeControlDockRect(
      {w: 120, h: 100},
      true,
    )).toEqual({
      x: -1,
      y: -1,
      w: 0,
      h: 0,
    })
    expect(bulkTimeSurfaceRect(
      {w: 320, h: 100},
      true,
    )).toEqual({
      x: -1,
      y: -1,
      w: 0,
      h: 0,
    })
    expect(bulkTimeSurfaceRect(
      {w: 1200, h: 800},
      false,
    )).toEqual({
      x: -1,
      y: -1,
      w: 0,
      h: 0,
    })
    expect(bulkTimeControlDockRect(
      {w: 1200, h: 800},
      false,
    )).toEqual({
      x: -1,
      y: -1,
      w: 0,
      h: 0,
    })
  })
})
