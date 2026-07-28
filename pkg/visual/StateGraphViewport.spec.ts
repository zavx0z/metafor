import {describe, expect, test} from "bun:test"
import type {
  StateGraphLayoutEdge,
  StateGraphLayoutNode,
} from "./StateGraphLayout.ts"
import {buildStateGraphEdgeCurve} from "./StateGraphViewport.ts"

const node = (
  id: string,
  x: number,
  y: number,
): StateGraphLayoutNode => ({
  color: [1, 1, 1],
  current: false,
  end: null,
  id,
  label: id,
  radius: 3.2,
  stateId: Number(id),
  step: 0,
  x,
  y,
  z: 0,
})

const edge = (returning: boolean): StateGraphLayoutEdge => ({
  conditionCount: 0,
  conditionFieldIds: [],
  fromNodeId: "5",
  id: "transition:5",
  returning,
  toNodeId: "4",
  transitionId: 5,
})

describe("State Graph viewport edge geometry", () => {
  test("draws a returning edge as a front arc and a top-view straight line", () => {
    const points = buildStateGraphEdgeCurve(
      edge(true),
      node("5", 44, 0),
      node("4", 22, 7.5),
    )

    expect(points[0]).toMatchObject({x: 44, y: 0, z: 0})
    expect(points.at(-1)).toMatchObject({x: 22, y: 7.5, z: 0})
    expect(Math.max(...points.map((point) => point.z))).toBe(10.5)

    const from = points[0]!
    const to = points.at(-1)!
    const chordX = to.x - from.x
    const chordY = to.y - from.y
    for (const point of points) {
      const cross = (point.x - from.x) * chordY -
        (point.y - from.y) * chordX
      expect(cross).toBeCloseTo(0)
    }
  })

  test("keeps an ordinary edge close to the graph plane", () => {
    const points = buildStateGraphEdgeCurve(
      edge(false),
      node("5", 0, 0),
      node("4", 22, 0),
    )

    expect(Math.max(...points.map((point) => point.z))).toBeCloseTo(0.7)
  })
})
