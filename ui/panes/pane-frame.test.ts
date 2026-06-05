import {describe, expect, test} from "bun:test"
import {
  PANE_FRAME,
  beginPaneFrameDrag,
  paneBodyRect,
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
    expect(paneFrameHit(318, 80, 320, 220, {resizable: true})).toBe("resize-right")
    expect(paneFrameHit(100, 218, 320, 220, {resizable: true})).toBe("resize-bottom")
    expect(paneFrameHit(318, 218, 320, 220, {resizable: true})).toBe("resize-bottom-right")
    expect(paneFrameHit(24, 12, 320, 220, {showHeader: false, movable: true, resizable: true})).toBeNull()
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
})
