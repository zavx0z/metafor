import {describe, expect, test} from "bun:test"
import {planNodeComponentPlaygroundFrames} from "./layout.ts"

describe("Node playground on shared @ui/playground shell", () => {
  test("gives editor the historical desktop preview region", () => {
    const frames = planNodeComponentPlaygroundFrames(1920, 1080, "editor/scene")
    expect(frames.catalog).toEqual({x: 130, y: 110, w: 210, h: 860})
    expect(frames.section).toEqual({x: 358, y: 110, w: 160, h: 860})
    expect(frames.editor).toEqual({x: 536, y: 110, w: 936, h: 742})
    expect(frames.dock).toEqual({x: 536, y: 870, w: 936, h: 100})
    expect(frames.info).toEqual({x: 1490, y: 110, w: 300, h: 860})
    expect(frames.sockets.visible).toBeFalse()
    expect(frames.reference.visible).toBeFalse()
  })

  test("uses the whole preview for sockets and equal slots for comparison", () => {
    const sockets = planNodeComponentPlaygroundFrames(1920, 1080, "socket/types")
    expect(sockets.sockets).toEqual({x: 536, y: 110, w: 936, h: 742})
    expect(sockets.editor.visible).toBeFalse()
    const comparison = planNodeComponentPlaygroundFrames(1920, 1080, "comparison/blender")
    expect(comparison.reference).toEqual({x: 536, y: 110, w: 459, h: 742})
    expect(comparison.detail).toEqual({x: 1013, y: 110, w: 459, h: 742})
  })

  test("gives mobile only the active package preview", () => {
    const editor = planNodeComponentPlaygroundFrames(390, 844, "editor/scene")
    expect(editor.editor).toEqual({x: 8, y: 8, w: 374, h: 828})
    for (const frame of [editor.catalog, editor.section, editor.dock, editor.info]) expect(frame.visible).toBeFalse()
    const comparison = planNodeComponentPlaygroundFrames(844, 390, "comparison/blender")
    expect(comparison.detail).toEqual({x: 8, y: 8, w: 828, h: 374})
    expect(comparison.reference.visible).toBeFalse()
  })
})
