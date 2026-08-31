import {describe, expect, test} from "bun:test"
import {
  BulkCausalTimeModel,
  buildBulkCausalTimePresentation,
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
    const timeline = buildBulkCausalTimeline(frames, 0.25)

    expect(timeline).toMatchObject({
      title: "ВРЕМЯ · causal stack",
      frameStart: 9,
      frameEnd: 21,
      frameCurrent: 12.5,
      visibleStart: 9,
      visibleEnd: 21,
      previewStart: 10,
      previewEnd: 20,
    })
    expect(timeline.keyframes).toEqual([
      {key: "frame-1", frame: 10, selected: true, label: "frame 1"},
      {key: "frame-2", frame: 20, selected: false, label: "frame 2"},
    ])
    expect(timeline.markers).toEqual([
      {key: "frame-2", frame: 20, selected: false, label: "degraded · frame 2"},
    ])
    const presentation = buildBulkCausalTimePresentation(frames, 0.25, "paused")
    expect(presentation.playback).toEqual({
      playing: false,
      previousDisabled: false,
      toggleDisabled: false,
      nextDisabled: false,
    })
    expect(presentation.channels.channels.map(({key, label}) => [key, label])).toEqual([
      ["force", "Force"],
      ["mass", "Mass"],
      ["boundary", "Boundary"],
    ])
    expect(presentation.channels.channels[0]?.points).toEqual([
      {key: "frame-1", frame: 10, selected: true, label: "frame 1", resolution: "exact"},
      {key: "frame-2", frame: 20, selected: false, label: "frame 2", resolution: "degraded"},
    ])
    expect(presentation.channels.channels[1]?.points)
      .toBe(presentation.channels.channels[0]?.points)
    expect(playheadForSequence(frames, 15)).toBeCloseTo(0.5)
  })

  test("keeps an empty stack valid without restoring legacy transport or tracks", () => {
    expect(buildBulkCausalTimeline([], 0)).toEqual({
      title: "ВРЕМЯ · causal stack",
      frameStart: -1,
      frameEnd: 1,
      frameCurrent: 0,
      visibleStart: -1,
      visibleEnd: 1,
      keyframes: [],
      markers: [],
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
    model.selectFrame(2)
    expect(model.playhead).toBe(1)
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
