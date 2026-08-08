import {describe, expect, test} from "bun:test"
import {
  placeUiCursorTooltip,
  placeUiSurfaceHitTooltip,
  placeUiSurfaceTooltip,
  wrapUiTooltipLabel,
} from "./surface.ts"

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

  test("places a tooltip from a tiny edge surface inside the full viewport", () => {
    const placement = placeUiSurfaceTooltip(
      {x: 21, y: 17},
      {w: 100, h: 27},
      {rect: {x: 874, y: 800, w: 42, h: 34}, bounds: {w: 916, h: 1088}},
    )
    expect(placement).toEqual({x: -62, y: -22, side: "top"})
    expect(874 + placement.x).toBeGreaterThanOrEqual(4)
    expect(874 + placement.x + 100).toBeLessThanOrEqual(912)
  })

  test("shifts top and bottom corner tooltips inward on both sides", () => {
    const bounds = {w: 916, h: 1088}
    const cases = [
      {rect: {x: 0, y: 0, w: 42, h: 34}, side: "right"},
      {rect: {x: 874, y: 0, w: 42, h: 34}, side: "bottom"},
      {rect: {x: 0, y: 1054, w: 42, h: 34}, side: "top"},
      {rect: {x: 874, y: 1054, w: 42, h: 34}, side: "top"},
    ] as const
    for (const item of cases) {
      const placement = placeUiSurfaceTooltip(
        {x: 21, y: 17},
        {w: 100, h: 27},
        {rect: item.rect, bounds},
      )
      const globalX = item.rect.x + placement.x
      const globalY = item.rect.y + placement.y
      expect(placement.side).toBe(item.side)
      expect(globalX).toBeGreaterThanOrEqual(4)
      expect(globalY).toBeGreaterThanOrEqual(4)
      expect(globalX + 100).toBeLessThanOrEqual(bounds.w - 4)
      expect(globalY + 27).toBeLessThanOrEqual(bounds.h - 4)
    }
  })

  test("keeps a full gap between an edge hit rectangle and its tooltip", () => {
    const frame = {rect: {x: 874, y: 744, w: 42, h: 34}, bounds: {w: 916, h: 1088}}
    const placement = placeUiSurfaceHitTooltip(
      {x: 0, y: 0, w: 42, h: 34},
      {w: 160, h: 27},
      frame,
    )
    const globalTooltipBottom = frame.rect.y + placement.y + 27
    expect(placement.side).toBe("top")
    expect(frame.rect.y - globalTooltipBottom).toBe(12)
  })

  test("keeps the same hit-rect gap in the top and bottom right corners", () => {
    const bounds = {w: 916, h: 1088}
    const top = placeUiSurfaceHitTooltip(
      {x: 0, y: 0, w: 42, h: 34},
      {w: 160, h: 27},
      {rect: {x: 874, y: 0, w: 42, h: 34}, bounds},
    )
    const bottom = placeUiSurfaceHitTooltip(
      {x: 0, y: 0, w: 42, h: 34},
      {w: 160, h: 27},
      {rect: {x: 874, y: 1054, w: 42, h: 34}, bounds},
    )
    expect(top).toEqual({x: -122, y: 46, side: "bottom"})
    expect(bottom).toEqual({x: -122, y: -39, side: "top"})
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
