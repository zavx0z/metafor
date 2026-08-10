import {describe, expect, test} from "bun:test"
import {
  nodeInspectorActionsHeight,
  nodeInspectorContentHeight,
  nodeInspectorRowsHeight,
  nodeInspectorValueNeedsTooltip,
} from "./inspector.ts"

describe("node inspector values", () => {
  const measure = (value: string, fontPx: number): number => value.length * fontPx

  test("adds disclosure only when the exact rendered value exceeds its slot", () => {
    expect(nodeInspectorValueNeedsTooltip("ready", 45, measure)).toBeFalse()
    expect(nodeInspectorValueNeedsTooltip("ready", 44, measure)).toBeTrue()
    expect(nodeInspectorValueNeedsTooltip("browser-control:full-id", 120, measure)).toBeTrue()
  })

  test("keeps every action in the scrollable inspector content", () => {
    expect(nodeInspectorRowsHeight(6)).toBe(142)
    expect(nodeInspectorActionsHeight(5)).toBe(164)
    expect(nodeInspectorContentHeight(6, 5, 154)).toBe(389)
    expect(nodeInspectorContentHeight(6, 5, 560)).toBe(560)
  })
})
