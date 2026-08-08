import {describe, expect, test} from "bun:test"
import {
  constrainHudPaneFrame,
  dockHudSideTabFrame,
  moveHudPaneFrame,
  moveHudSideTabFrame,
} from "./pane-frame.ts"

describe("HUD pane frame", () => {
  test("moves a frame and clamps it to the visible bounds", () => {
    const frame = {x: 600, y: 100, w: 320, h: 500}
    expect(moveHudPaneFrame(frame, "move", -200, 120, {w: 1200, h: 800}, 240, 220))
      .toEqual({x: 400, y: 220, w: 320, h: 500})
    expect(moveHudPaneFrame(frame, "move", 1000, 1000, {w: 1200, h: 800}, 240, 220))
      .toEqual({x: 880, y: 300, w: 320, h: 500})
  })

  test("resizes from all edges while retaining the opposite edge", () => {
    const frame = {x: 600, y: 100, w: 320, h: 500}
    expect(moveHudPaneFrame(frame, "left", 80, 0, {w: 1200, h: 800}, 240, 220))
      .toEqual({x: 680, y: 100, w: 240, h: 500})
    expect(moveHudPaneFrame(frame, "right", 100, 0, {w: 1200, h: 800}, 240, 220))
      .toEqual({x: 600, y: 100, w: 420, h: 500})
    expect(moveHudPaneFrame(frame, "top-left", -100, 300, {w: 1200, h: 800}, 240, 220))
      .toEqual({x: 500, y: 380, w: 420, h: 220})
    expect(moveHudPaneFrame(frame, "bottom-right", -200, -400, {w: 1200, h: 800}, 240, 220))
      .toEqual({x: 600, y: 100, w: 240, h: 220})
  })

  test("constrains oversized frames for tiny viewports", () => {
    expect(constrainHudPaneFrame({x: 10, y: 20, w: 400, h: 300}, {w: 30, h: 20}, 240, 220))
      .toEqual({x: 0, y: 0, w: 30, h: 20})
  })

  test("keeps a movable side tab on the viewport perimeter", () => {
    const right = {x: 1158, y: 100, w: 42, h: 34}
    expect(moveHudSideTabFrame(right, -18, 150, {w: 1200, h: 800}, "right"))
      .toEqual({edge: "right", rect: {x: 1158, y: 250, w: 42, h: 34}})
    expect(moveHudSideTabFrame(right, -800, -120, {w: 1200, h: 800}, "right"))
      .toEqual({edge: "top", rect: {x: 358, y: 0, w: 42, h: 34}})
  })

  test("repairs a formerly floating side tab by docking it to the nearest edge", () => {
    expect(dockHudSideTabFrame({x: 950, y: 300, w: 42, h: 34}, {w: 1200, h: 800}, "right"))
      .toEqual({edge: "right", rect: {x: 1158, y: 300, w: 42, h: 34}})
  })
})
