import {describe, expect, test} from "bun:test"
import {
  bulkTimeFramePosition,
  bulkTimeFrameTone,
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
  })

  test("places keyframes by causal sequence and keeps a single frame centered", () => {
    const frames = readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 10}},
      {id: 2, frontier: {acceptanceSequence: 15}},
      {id: 3, frontier: {acceptanceSequence: 20}},
    ])
    expect(frames.map((frame) => bulkTimeFramePosition(frame, frames))).toEqual([0, 0.5, 1])
    expect(bulkTimeFramePosition(frames[0]!, [frames[0]!])).toBe(0.5)
  })

  test("keeps selected, exact, degraded, overloaded and unknown tones distinct", () => {
    const frame = {id: 1, frontier: {acceptanceSequence: 1}} as const
    expect(bulkTimeFrameTone(frame, true)).toBe("selected")
    expect(bulkTimeFrameTone({...frame, resolution: "exact"}, false)).toBe("exact")
    expect(bulkTimeFrameTone({...frame, resolution: "degraded"}, false)).toBe("degraded")
    expect(bulkTimeFrameTone({...frame, resolution: "overloaded"}, false)).toBe("overloaded")
    expect(bulkTimeFrameTone(frame, false)).toBe("unknown")
  })

  test("stays above the observer cut and inside short viewports", () => {
    expect(bulkTimeSurfaceRect(
      {w: 1200, h: 800},
      true,
      {x: 42, y: 558, w: 1116, h: 224},
    )).toEqual({
      x: 42,
      y: 354,
      w: 1116,
      h: 192,
    })
    expect(bulkTimeSurfaceRect(
      {w: 320, h: 100},
      true,
      {x: 0, y: 0, w: 320, h: 100},
    )).toEqual({
      x: 0,
      y: 0,
      w: 320,
      h: 100,
    })
    expect(bulkTimeSurfaceRect(
      {w: 1200, h: 800},
      false,
      {x: 42, y: 558, w: 1116, h: 224},
    )).toEqual({
      x: -1,
      y: -1,
      w: 0,
      h: 0,
    })
  })
})
