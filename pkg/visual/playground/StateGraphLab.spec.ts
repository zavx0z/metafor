import {describe, expect, test} from "bun:test"
import type {
  StateGraphLayoutEdge,
  StateGraphLayoutNode,
} from "../StateGraphLayout.ts"
import {createStateGraphHermiteEdgeCurveBuilder} from "./StateGraphLab.ts"

const node = (
  id: string,
  x: number,
  y: number,
): StateGraphLayoutNode => ({
  color: [1, 1, 1],
  current: false,
  end: null,
  fieldRadius: 0.32,
  fields: [],
  id,
  innerRadius: 0.35584,
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
  fromNodeId: "1",
  id: `edge:${returning}`,
  returning,
  toNodeId: "2",
  transitionId: 1,
})

describe("State Graph playground Hermite edges", () => {
  const build = createStateGraphHermiteEdgeCurveBuilder()
  const from = node("1", -11, -4)
  const to = node("2", 11, 6)

  test("connects the exact State centers above the plane when moving forward", () => {
    const points = build(edge(false), from, to)

    expect(points[0]).toEqual({x: from.x, y: from.y, z: from.z})
    expect(points.at(-1)?.x).toBeCloseTo(to.x)
    expect(points.at(-1)?.y).toBeCloseTo(to.y)
    expect(points.at(-1)?.z).toBeCloseTo(to.z)
    expect(Math.max(...points.map((point) => point.z))).toBeGreaterThan(0)
    expect(Math.min(...points.map((point) => point.z))).toBeCloseTo(0)
  })

  test("uses the same Hermite profile below the plane for a return", () => {
    const forward = build(edge(false), from, to)
    const returning = build(edge(true), from, to)

    expect(returning[0]).toEqual({x: from.x, y: from.y, z: from.z})
    expect(returning.at(-1)?.x).toBeCloseTo(to.x)
    expect(returning.at(-1)?.y).toBeCloseTo(to.y)
    expect(returning.at(-1)?.z).toBeCloseTo(to.z)
    expect(Math.min(...returning.map((point) => point.z))).toBeLessThan(0)
    for (const [index, point] of returning.entries()) {
      expect(point.x).toBeCloseTo(forward[index]!.x)
      expect(point.y).toBeCloseTo(forward[index]!.y)
      expect(point.z).toBeCloseTo(-forward[index]!.z)
    }
  })
})
