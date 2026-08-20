import {describe, expect, test} from "bun:test"
import {planNodeComponentPlaygroundFrames} from "./layout.ts"

describe("Node playground on shared @ui/playground shell", () => {
  test("gives editor the full-viewport desktop preview region", () => {
    const frames = planNodeComponentPlaygroundFrames(1920, 1080, "editor/scene")
    expect(frames.catalog).toEqual({x: 16, y: 16, w: 210, h: 1048})
    expect(frames.section).toEqual({x: 244, y: 16, w: 160, h: 1048})
    expect(frames.editor).toEqual({x: 422, y: 16, w: 1024, h: 930})
    expect(frames.dock).toEqual({x: 422, y: 964, w: 1024, h: 100})
    expect(frames.info).toEqual({x: 1464, y: 16, w: 440, h: 1048})
    expect(frames.sockets.visible).toBeFalse()
    expect(frames.reference.visible).toBeFalse()
  })

  test("uses the whole preview for sockets and equal slots for comparison", () => {
    const sockets = planNodeComponentPlaygroundFrames(1920, 1080, "socket/types")
    expect(sockets.sockets).toEqual({x: 422, y: 16, w: 1024, h: 930})
    expect(sockets.editor.visible).toBeFalse()
    const comparison = planNodeComponentPlaygroundFrames(1920, 1080, "comparison/blender")
    expect(comparison.reference).toEqual({x: 422, y: 16, w: 503, h: 930})
    expect(comparison.detail).toEqual({x: 943, y: 16, w: 503, h: 930})
  })
})
