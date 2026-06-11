import {describe, expect, test} from "bun:test"
import {
  PANE_FRAME,
  beginPaneFrameDrag,
  paneBodyRect,
  paneFrameCursor,
  paneFrameDragRect,
  paneFrameHit,
  paneHeaderRuleRect,
} from "./pane-frame.ts"

describe("pane frame", () => {
  test("uses one shared body inset and header gap", () => {
    expect(paneBodyRect(100, 80)).toEqual({
      x: PANE_FRAME.bodyInsetX,
      y: PANE_FRAME.headerHeight + PANE_FRAME.bodyTopGap,
      w: 100 - PANE_FRAME.bodyInsetX * 2,
      h: 80 - PANE_FRAME.headerHeight - PANE_FRAME.bodyTopGap - PANE_FRAME.bodyBottomInset,
    })
  })

  test("keeps headerless panes flush at the top", () => {
    expect(paneBodyRect(100, 80, {headerHeight: 28, showHeader: false})).toEqual({
      x: PANE_FRAME.bodyInsetX,
      y: 0,
      w: 100 - PANE_FRAME.bodyInsetX * 2,
      h: 80 - PANE_FRAME.bodyBottomInset,
    })
  })

  test("aligns header rule with the pane body", () => {
    expect(paneHeaderRuleRect(100)).toEqual({
      x: PANE_FRAME.bodyInsetX,
      y: PANE_FRAME.headerHeight,
      w: 100 - PANE_FRAME.bodyInsetX * 2,
      h: PANE_FRAME.ruleHeight,
    })
  })

  test("requires explicit frame movement and resize flags", () => {
    expect(paneFrameHit(24, 12, 320, 220)).toBeNull()
    expect(paneFrameHit(318, 80, 320, 220)).toBeNull()
    expect(paneFrameHit(24, 12, 320, 220, {movable: true})).toBe("move")
    expect(paneFrameHit(2, 80, 320, 220, {resizable: true})).toBe("resize-left")
    expect(paneFrameHit(318, 80, 320, 220, {resizable: true})).toBe("resize-right")
    expect(paneFrameHit(100, 2, 320, 220, {resizable: true})).toBe("resize-top")
    expect(paneFrameHit(100, 218, 320, 220, {resizable: true})).toBe("resize-bottom")
    expect(paneFrameHit(2, 2, 320, 220, {resizable: true})).toBe("resize-top-left")
    expect(paneFrameHit(318, 2, 320, 220, {resizable: true})).toBe("resize-top-right")
    expect(paneFrameHit(2, 218, 320, 220, {resizable: true})).toBe("resize-bottom-left")
    expect(paneFrameHit(318, 218, 320, 220, {resizable: true})).toBe("resize-bottom-right")
    expect(paneFrameHit(24, 12, 320, 220, {showHeader: false, movable: true, resizable: true})).toBeNull()
  })

  test("uses standard resize cursors for every edge and corner", () => {
    expect(paneFrameCursor("resize-left")).toBe("ew-resize")
    expect(paneFrameCursor("resize-right")).toBe("ew-resize")
    expect(paneFrameCursor("resize-top")).toBe("ns-resize")
    expect(paneFrameCursor("resize-bottom")).toBe("ns-resize")
    expect(paneFrameCursor("resize-top-left")).toBe("nwse-resize")
    expect(paneFrameCursor("resize-bottom-right")).toBe("nwse-resize")
    expect(paneFrameCursor("resize-top-right")).toBe("nesw-resize")
    expect(paneFrameCursor("resize-bottom-left")).toBe("nesw-resize")
  })

  test("clamps move and resize interactions to bounds", () => {
    const drag = beginPaneFrameDrag(
      "move",
      {clientX: 10, clientY: 20} as MouseEvent,
      {x: 40, y: 50, w: 200, h: 120},
    )
    expect(paneFrameDragRect(drag, {clientX: -100, clientY: 900} as MouseEvent, {w: 500, h: 400})).toEqual({
      x: 0,
      y: 280,
      w: 200,
      h: 120,
    })

    const resize = beginPaneFrameDrag(
      "resize-bottom-right",
      {clientX: 0, clientY: 0} as MouseEvent,
      {x: 420, y: 330, w: 70, h: 60},
      {minW: 160, minH: 120},
    )
    expect(paneFrameDragRect(resize, {clientX: 80, clientY: 80} as MouseEvent, {w: 500, h: 400})).toEqual({
      x: 340,
      y: 280,
      w: 160,
      h: 120,
    })
  })

  test("resizes from left and top edges while keeping the opposite edge stable", () => {
    const left = beginPaneFrameDrag(
      "resize-left",
      {clientX: 100, clientY: 0} as MouseEvent,
      {x: 100, y: 50, w: 220, h: 140},
      {minW: 160, minH: 120},
    )
    expect(paneFrameDragRect(left, {clientX: 60, clientY: 0} as MouseEvent, {w: 600, h: 500})).toEqual({
      x: 60,
      y: 50,
      w: 260,
      h: 140,
    })

    const top = beginPaneFrameDrag(
      "resize-top",
      {clientX: 0, clientY: 100} as MouseEvent,
      {x: 100, y: 90, w: 220, h: 140},
      {minW: 160, minH: 120},
    )
    expect(paneFrameDragRect(top, {clientX: 0, clientY: 50} as MouseEvent, {w: 600, h: 500})).toEqual({
      x: 100,
      y: 40,
      w: 220,
      h: 190,
    })
  })

  test("resizes from diagonal corners on both axes", () => {
    const topRight = beginPaneFrameDrag(
      "resize-top-right",
      {clientX: 0, clientY: 0} as MouseEvent,
      {x: 100, y: 90, w: 220, h: 140},
      {minW: 160, minH: 120},
    )
    expect(paneFrameDragRect(topRight, {clientX: 40, clientY: -30} as MouseEvent, {w: 600, h: 500})).toEqual({
      x: 100,
      y: 60,
      w: 260,
      h: 170,
    })

    const bottomLeft = beginPaneFrameDrag(
      "resize-bottom-left",
      {clientX: 0, clientY: 0} as MouseEvent,
      {x: 100, y: 90, w: 220, h: 140},
      {minW: 160, minH: 120},
    )
    expect(paneFrameDragRect(bottomLeft, {clientX: -50, clientY: 40} as MouseEvent, {w: 600, h: 500})).toEqual({
      x: 50,
      y: 90,
      w: 270,
      h: 180,
    })
  })

  test("clamps left and top resize to minimum size", () => {
    const topLeft = beginPaneFrameDrag(
      "resize-top-left",
      {clientX: 0, clientY: 0} as MouseEvent,
      {x: 100, y: 90, w: 220, h: 140},
      {minW: 160, minH: 120},
    )
    expect(paneFrameDragRect(topLeft, {clientX: 1000, clientY: 1000} as MouseEvent, {w: 600, h: 500})).toEqual({
      x: 160,
      y: 110,
      w: 160,
      h: 120,
    })
  })
})
