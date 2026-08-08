import {describe, expect, test} from "bun:test"
import {placeUiCursorTooltip} from "./surface.ts"

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
