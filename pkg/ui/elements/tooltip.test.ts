import {describe, expect, test} from "bun:test"
import {placeUiCursorTooltip, wrapUiTooltipLabel} from "./surface.ts"

describe("cursor tooltip placement", () => {
  test("uses top by default and keeps the tooltip inside horizontal bounds", () => {
    expect(placeUiCursorTooltip({x: 400, y: 300}, {w: 120, h: 24}, {w: 800, h: 600})).toEqual({
      x: 340,
      y: 264,
      side: "top",
    })
    expect(placeUiCursorTooltip({x: 8, y: 300}, {w: 120, h: 24}, {w: 800, h: 600})).toEqual({
      x: 4,
      y: 264,
      side: "top",
    })
  })

  test("falls back top then right, bottom and left at browser edges", () => {
    expect(placeUiCursorTooltip({x: 8, y: 8}, {w: 120, h: 24}, {w: 800, h: 600}).side).toBe("right")
    expect(placeUiCursorTooltip({x: 790, y: 8}, {w: 120, h: 24}, {w: 800, h: 600}).side).toBe("bottom")
    expect(placeUiCursorTooltip({x: 790, y: 590}, {w: 120, h: 580}, {w: 800, h: 600}).side).toBe("left")
  })
})

describe("tooltip text wrapping", () => {
  const measure = (value: string): number => value.length * 10

  test("keeps a fitting label on one line and wraps a technical id without losing it", () => {
    expect(wrapUiTooltipLabel("Service Worker", 160, measure)).toEqual(["Service Worker"])
    const value = "browser-control:ddd55671-d1b2-4112-880f-aeb590edc4b0"
    const lines = wrapUiTooltipLabel(value, 180, measure)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((line) => measure(line) <= 180)).toBeTrue()
    expect(lines.join("")).toBe(value)
  })

  test("caps pathological content and marks the last visible line", () => {
    const lines = wrapUiTooltipLabel("a".repeat(200), 50, measure, 3)
    expect(lines).toHaveLength(3)
    expect(lines[2]?.endsWith("…")).toBeTrue()
    expect(lines.every((line) => measure(line) <= 50)).toBeTrue()
  })
})
