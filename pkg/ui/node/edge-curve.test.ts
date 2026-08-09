import {describe, expect, test} from "bun:test"
import {
  connectNodeSystemEdgeToVisibleSockets,
  planNodeSystemBezierPath,
  planNodeSystemEdgeHitRects,
  sampleNodeSystemBezierPath,
  sampleNodeSystemCubicBezier,
} from "./edge-curve.ts"

describe("node-system Bézier edge rendering", () => {
  test("adds only the short renderer stub from each ELK port boundary to its visible parameter socket", () => {
    const edge = {
      edge: {
        id: "message",
        source: {nodeId: "source", portId: "out"},
        target: {nodeId: "target", portId: "in"},
      },
      points: [{x: 104, y: 50}, {x: 296, y: 50}],
    }
    const nodes = new Map([
      ["source", {
        node: {
          id: "source",
          title: "Source",
          facts: [{id: "message", label: "Message", value: "out"}],
          ports: [{id: "out", parameterId: "message", direction: "out" as const}],
        },
        rect: {x: 0, y: 0, w: 100, h: 80},
        ports: [{port: {id: "out", parameterId: "message", direction: "out" as const}, center: {x: 100, y: 50}}],
      }],
      ["target", {
        node: {
          id: "target",
          title: "Target",
          facts: [{id: "message", label: "Message", value: "in"}],
          ports: [{id: "in", parameterId: "message", direction: "in" as const}],
        },
        rect: {x: 300, y: 0, w: 100, h: 80},
        ports: [{port: {id: "in", parameterId: "message", direction: "in" as const}, center: {x: 300, y: 50}}],
      }],
    ])

    expect(connectNodeSystemEdgeToVisibleSockets(edge, nodes)).toEqual([
      {x: 100, y: 50},
      {x: 104, y: 50},
      {x: 296, y: 50},
      {x: 300, y: 50},
    ])
    expect(edge.points).toEqual([{x: 104, y: 50}, {x: 296, y: 50}])
  })

  test("preserves routed endpoints and rounds an ELK corner", () => {
    const curves = planNodeSystemBezierPath([
      {x: 0, y: 0},
      {x: 100, y: 0},
      {x: 100, y: 80},
    ], 12)
    expect(curves[0]?.from).toEqual({x: 0, y: 0})
    expect(curves.at(-1)?.to).toEqual({x: 100, y: 80})
    const corner = curves.find(({control1, control2}) => control1.x !== control2.x && control1.y !== control2.y)
    expect(corner).toBeDefined()
    const samples = sampleNodeSystemCubicBezier(corner!, 8)
    expect(samples.some(({x, y}) => x > 88 && x < 100 && y > 0 && y < 12)).toBe(true)
    expect(samples.every(({x, y}) => x >= 88 && x <= 100 && y >= 0 && y <= 12)).toBe(true)
  })

  test("keeps a direct route direct and ignores duplicate zero-length pieces", () => {
    const curves = planNodeSystemBezierPath([{x: 5, y: 7}, {x: 5, y: 7}, {x: 25, y: 7}], 10)
    expect(curves).toHaveLength(1)
    expect(curves[0]?.from).toEqual({x: 5, y: 7})
    expect(curves[0]?.to).toEqual({x: 25, y: 7})
    expect(sampleNodeSystemCubicBezier(curves[0]!, 4).every(({y}) => y === 7)).toBe(true)
  })

  test("emits one continuous stroke and does not subdivide straight runs", () => {
    const stroke = sampleNodeSystemBezierPath([
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
    const stroke = sampleNodeSystemBezierPath([{x: 10, y: 20}, {x: 90, y: 20}], 10, 6)
    expect(planNodeSystemEdgeHitRects(stroke, 5)).toEqual([
      {x: 5, y: 15, w: 90, h: 10},
    ])
  })
})
