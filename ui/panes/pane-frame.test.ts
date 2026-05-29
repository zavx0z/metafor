import {describe, expect, test} from "bun:test"
import {PANE_FRAME, paneBodyRect, paneHeaderRuleRect} from "./pane-frame.ts"

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
})
