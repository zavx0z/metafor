import {describe, expect, test} from "bun:test"
import {planNodeComponentPlaygroundFrames} from "./ui-workbench-layout.ts"
import {nodePlaygroundWorkbenchStoryRoute} from "./ui-navigation.ts"

describe("Node playground on shared @ui/playground shell", () => {
  test("preserves preview, dock and source panel on package and component overviews", () => {
    const root = planNodeComponentPlaygroundFrames(1920, 1080, nodePlaygroundWorkbenchStoryRoute(""))
    const socket = planNodeComponentPlaygroundFrames(1920, 1080, nodePlaygroundWorkbenchStoryRoute("socket"))
    const editor = planNodeComponentPlaygroundFrames(1920, 1080, nodePlaygroundWorkbenchStoryRoute("node-editor"))
    expect(root.storyPreview).toEqual(socket.storyPreview)
    expect(root.story.visible).not.toBeFalse()
    expect(root.dock.visible).not.toBeFalse()
    expect(editor.editor.visible).not.toBeFalse()
    expect(editor.story.visible).not.toBeFalse()
    expect(editor.dock.visible).not.toBeFalse()
  })

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

  test("shows only the active preview on a compact centralized target", () => {
    const frames = planNodeComponentPlaygroundFrames(493, 1088, "node-editor/scene/default")
    expect(frames.catalog.visible).toBeFalse()
    expect(frames.section.visible).toBeFalse()
    expect(frames.story.visible).toBeFalse()
    expect(frames.dock.visible).toBeFalse()
    expect(frames.editor.w).toBeGreaterThan(470)
    expect(frames.editor.h).toBeGreaterThan(1000)
  })
})
