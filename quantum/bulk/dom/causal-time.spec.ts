import {describe, expect, test} from "bun:test"
import {
  BulkCausalTimeModel,
  buildBulkCausalTimeline,
  playheadForSequence,
  readBulkTimeFrames,
} from "./causal-time.ts"

describe("Bulk DOM causal time", () => {
  test("validates causal frame identity and projects standard Timeline props", () => {
    const frames = readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 10}, resolution: "exact"},
      {id: 2, frontier: {acceptanceSequence: 20}, resolution: "degraded"},
    ])
    const timeline = buildBulkCausalTimeline(frames, 0.25, false)

    expect(timeline).toMatchObject({
      title: "ВРЕМЯ · causal stack",
      min: 9,
      max: 21,
      current: 12.5,
      playing: false,
    })
    expect(timeline.tracks.map(({key, label}) => [key, label])).toEqual([
      ["force", "Force"],
      ["mass", "Mass"],
      ["boundary", "Boundary"],
    ])
    expect(timeline.tracks[0]?.markers).toEqual([
      {key: "frame-1", tick: 10, selected: true, label: "frame 1"},
      {key: "frame-2", tick: 20, selected: false, label: "frame 2"},
    ])
    expect(timeline.tracks[1]?.markers).toBe(timeline.tracks[0]?.markers)
    expect(playheadForSequence(frames, 15)).toBeCloseTo(0.5)
  })

  test("keeps an empty stack valid without inventing semantic tracks", () => {
    expect(buildBulkCausalTimeline([], 0, true)).toEqual({
      title: "ВРЕМЯ · causal stack",
      min: -1,
      max: 1,
      current: 0,
      playing: true,
      tracks: [
        {key: "force", label: "Force", markers: []},
        {key: "mass", label: "Mass", markers: []},
        {key: "boundary", label: "Boundary", markers: []},
      ],
    })
  })

  test("rejects malformed and non-increasing Dark stacks", () => {
    expect(() => readBulkTimeFrames([{id: 0, frontier: {acceptanceSequence: 10}}]))
      .toThrow("invalid causal frame")
    expect(() => readBulkTimeFrames([{id: 1, frontier: {acceptanceSequence: "10"}}]))
      .toThrow("acceptance sequence")
    expect(() => readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 10}, resolution: "fast"},
    ])).toThrow("invalid resolution")
    expect(() => readBulkTimeFrames([
      {id: 1, frontier: {acceptanceSequence: 11}},
      {id: 2, frontier: {acceptanceSequence: 11}},
    ])).toThrow("non-increasing acceptance sequence")
  })

  test("owns pause, resume and selection state independently from the view", async () => {
    const calls: string[] = []
    let stack: unknown = []
    const model = new BulkCausalTimeModel({
      async stack() {
        calls.push("stack")
        return stack
      },
      async pause() {
        calls.push("pause")
        stack = [
          {id: 1, frontier: {acceptanceSequence: 4}},
          {id: 2, frontier: {acceptanceSequence: 16}},
        ]
      },
      async resume() {
        calls.push("resume")
        stack = []
      },
    })
    const snapshots: string[] = []
    model.subscribe(({state, message}) => snapshots.push(`${state}:${message}`))

    await model.open()
    expect(model.state).toBe("open")
    expect(model.canPause).toBeTrue()
    await model.pause()
    expect(model.state).toBe("paused")
    expect(model.frames).toHaveLength(2)
    expect(model.playhead).toBe(1)
    model.selectRelativeFrame(-1)
    expect(model.playhead).toBe(0)
    expect(model.message).toBe("Просмотр позиции; live и 3D не изменены")
    await model.resume()
    expect(model.state).toBe("open")
    expect(model.frames).toEqual([])
    expect(calls).toEqual(["stack", "pause", "stack", "resume"])
    expect(snapshots.some((value) => value.startsWith("pausing:"))).toBeTrue()
    expect(snapshots.some((value) => value.startsWith("resuming:"))).toBeTrue()

    model.dispose()
    expect(() => model.setPlayhead(0.5)).toThrow("disposed")
  })
})
