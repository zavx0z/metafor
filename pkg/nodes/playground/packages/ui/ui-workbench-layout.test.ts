import {describe, expect, test} from "bun:test"
import {planNodeComponentPlaygroundFrames} from "./ui-workbench-layout.ts"

describe("Node playground on shared @ui/playground shell", () => {
  test("gives editor the full-viewport desktop preview region", () => {
    const frames = planNodeComponentPlaygroundFrames(1920, 1080, "node-editor/scene/default")
    expect(frames.catalog).toEqual({x: 3, y: 3, w: 210, h: 1074})
    expect(frames.section).toEqual({x: 214, y: 3, w: 160, h: 1074})
    expect(frames.editor).toEqual({x: 375, y: 3, w: 1101, h: 1049})
    expect(frames.dock).toEqual({x: 375, y: 1053, w: 1101, h: 24})
    expect(frames.story).toEqual({x: 1477, y: 3, w: 440, h: 1074})
    expect(frames.sockets.visible).toBeFalse()
    expect(frames.reference.visible).toBeFalse()
  })

  test("uses a detail preview and story panel for Socket while keeping the aggregate grid hidden", () => {
    const sockets = planNodeComponentPlaygroundFrames(1920, 1080, "socket/boolean/input")
    expect(sockets.storyPreview).toEqual({x: 375, y: 3, w: 1101, h: 1049})
    expect(sockets.story).toEqual({x: 1477, y: 3, w: 440, h: 1074})
    expect(sockets.sockets.visible).toBeFalse()
    expect(sockets.editor.visible).toBeFalse()
  })

  test("keeps equal preview slots for the legacy Blender comparison", () => {
    const comparison = planNodeComponentPlaygroundFrames(1920, 1080, "comparison/blender/default")
    expect(comparison.reference).toEqual({x: 375, y: 3, w: 541.5, h: 1049})
    expect(comparison.detail).toEqual({x: 934.5, y: 3, w: 541.5, h: 1049})
    expect(comparison.story).toEqual({x: 1477, y: 3, w: 440, h: 1074})
  })
})
