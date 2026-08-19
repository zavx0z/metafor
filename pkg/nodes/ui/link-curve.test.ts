import {describe, expect, test} from "bun:test"
import {
  hitTestLinks,
  planLinkBezierPath,
  planLinkHitRects,
  sampleLinkBezierPath,
  sampleLinkCubicBezier,
} from "./link-curve.ts"

describe("Bézier Link rendering", () => {
  test("preserves exact routed endpoints and rounds an orthogonal corner", () => {
    const curves = planLinkBezierPath([
      {x: 0, y: 0},
      {x: 100, y: 0},
      {x: 100, y: 80},
    ], 12)
    expect(curves[0]?.from).toEqual({x: 0, y: 0})
    expect(curves.at(-1)?.to).toEqual({x: 100, y: 80})
    const corner = curves.find(({control1, control2}) => control1.x !== control2.x && control1.y !== control2.y)
    expect(corner).toBeDefined()
    const samples = sampleLinkCubicBezier(corner!, 8)
    expect(samples.some(({x, y}) => x > 88 && x < 100 && y > 0 && y < 12)).toBe(true)
    expect(samples.every(({x, y}) => x >= 88 && x <= 100 && y >= 0 && y <= 12)).toBe(true)
  })

  test("keeps a direct route direct and ignores duplicate zero-length pieces", () => {
    const curves = planLinkBezierPath([{x: 5, y: 7}, {x: 5, y: 7}, {x: 25, y: 7}], 10)
    expect(curves).toHaveLength(1)
    expect(curves[0]?.from).toEqual({x: 5, y: 7})
    expect(curves[0]?.to).toEqual({x: 25, y: 7})
    expect(sampleLinkCubicBezier(curves[0]!, 4).every(({y}) => y === 7)).toBe(true)
  })

  test("emits one continuous stroke and does not subdivide straight runs", () => {
    const stroke = sampleLinkBezierPath([
      {x: 0, y: 0},
      {x: 80, y: 0},
      {x: 80, y: 60},
      {x: 140, y: 60},
    ], 10, 6)
    expect(stroke[0]).toEqual({x: 0, y: 0})
    expect(stroke.at(-1)).toEqual({x: 140, y: 60})
    expect(stroke.filter(({y}) => y === 0).length).toBeLessThanOrEqual(3)
    for (let index = 1; index < stroke.length; index += 1) {
      expect(stroke[index]).not.toEqual(stroke[index - 1])
    }
  })

  test("builds narrow tooltip corridors along the sampled edge", () => {
    const stroke = sampleLinkBezierPath([{x: 10, y: 20}, {x: 90, y: 20}], 10, 6)
    expect(planLinkHitRects(stroke, 5)).toEqual([
      {x: 5, y: 15, w: 90, h: 10},
    ])
  })

  test("returns every overlapping semantic edge independently of input order", () => {
    const targets = [
      {linkId: "link-b", rects: [{x: 10, y: 10, w: 40, h: 10}]},
      {linkId: "link-a", rects: [{x: 20, y: 5, w: 10, h: 30}]},
      {linkId: "link-c", rects: [{x: 80, y: 80, w: 10, h: 10}]},
    ]
    expect(hitTestLinks(targets, {x: 25, y: 15})).toEqual(["link-a", "link-b"])
    expect(hitTestLinks([...targets].reverse(), {x: 25, y: 15})).toEqual(["link-a", "link-b"])
    expect(hitTestLinks(targets, {x: 25, y: 15}, [{x: 22, y: 12, w: 6, h: 6}])).toEqual([])
  })
})
