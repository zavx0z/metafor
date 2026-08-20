import {describe, expect, test} from "bun:test"
import {radii, uiShapeMetrics as publicUiShapeMetrics} from "./index.ts"
import {uiShapeMetrics} from "./shape.ts"

describe("shared UI shape metrics", () => {
  test("publishes one exact immutable visible-geometry owner", () => {
    expect(uiShapeMetrics).toEqual({
      controlHeight: 22,
      rowHeight: 24,
      lowRadius: 4,
      borderWidth: 1,
      separatorWidth: 1,
      tightGap: 3,
      iconActionSlot: 22,
      iconGlyphSize: 14,
      compactFontPx: 11,
      panelHeaderHeight: 24,
      panelSectionGap: 3,
    })
    expect(Object.isFrozen(uiShapeMetrics)).toBeTrue()
    expect(publicUiShapeMetrics).toBe(uiShapeMetrics)
    expect(radii.control).toBe(uiShapeMetrics.lowRadius)
  })

  test("keeps dense controls inside their shared row and rule rhythm", () => {
    expect(uiShapeMetrics.controlHeight).toBeLessThanOrEqual(uiShapeMetrics.rowHeight)
    expect(uiShapeMetrics.iconActionSlot).toBeLessThanOrEqual(uiShapeMetrics.rowHeight)
    expect(uiShapeMetrics.iconGlyphSize).toBeLessThan(uiShapeMetrics.iconActionSlot)
    expect(uiShapeMetrics.compactFontPx).toBeLessThan(uiShapeMetrics.controlHeight)
    expect(uiShapeMetrics.lowRadius * 2).toBeLessThan(uiShapeMetrics.controlHeight)
    expect(uiShapeMetrics.borderWidth).toBe(uiShapeMetrics.separatorWidth)
    expect(uiShapeMetrics.separatorWidth).toBeLessThanOrEqual(uiShapeMetrics.tightGap)
    expect(uiShapeMetrics.tightGap).toBeLessThan(uiShapeMetrics.controlHeight)
    expect(uiShapeMetrics.panelHeaderHeight).toBe(uiShapeMetrics.rowHeight)
    expect(uiShapeMetrics.panelSectionGap).toBe(uiShapeMetrics.tightGap)
  })
})
