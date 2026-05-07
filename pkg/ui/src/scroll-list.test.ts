import {describe, expect, test} from "bun:test"
import {ScrollListState, scrollList} from "./scroll-list.ts"

describe("ScrollListState", () => {
  test("applies pixel wheel delta in row units", () => {
    let changes = 0
    const state = new ScrollListState({onChange: () => changes++})

    const changed = state.applyWheel({deltaMode: 0, deltaY: 5} as WheelEvent, 10, 100, 10)

    expect(changed).toBe(true)
    expect(state.scroll).toBe(0.5)
    expect(changes).toBe(1)
  })

  test("applies tiny pixel wheel deltas immediately", () => {
    let changes = 0
    const state = new ScrollListState({onChange: () => changes++})

    expect(state.applyWheel({deltaMode: 0, deltaY: 0.2} as WheelEvent, 10, 100, 10)).toBe(true)
    expect(state.scroll).toBeCloseTo(0.02)
    expect(state.scrollAccum).toBe(0)
    expect(changes).toBe(1)
  })

  test("clamps to available rows", () => {
    const state = new ScrollListState()
    state.jumpTo(100)

    state.clamp(12, 5)

    expect(state.scroll).toBe(7)
  })
})

describe("scrollList", () => {
  test("draws visible rows without requiring scrollbar when all rows fit", () => {
    const rows: Array<[string, number, number, number, number, number]> = []
    const state = new ScrollListState()

    const metrics = scrollList({} as never, {
      state,
      items: ["a", "b"],
      rowH: 10,
      x: 1,
      y: 2,
      w: 30,
      h: 25,
      drawRow: (item, idx, x, y, w, h) => rows.push([item, idx, x, y, w, h]),
    })

    expect(metrics).toEqual({visible: 2, scroll: 0})
    expect(rows).toEqual([
      ["a", 0, 1, 2, 30, 10],
      ["b", 1, 1, 12, 30, 10],
    ])
  })
})
