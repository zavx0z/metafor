import {describe, expect, test} from "bun:test"
import type {
  StateGraphLayoutEdge,
  StateGraphLayoutNode,
} from "../src/StateGraphLayout.ts"
import type {StateGraph} from "../src/StateGraph.ts"
import {
  buildStateGraphBranchLayout,
  createStateGraphHermiteEdgeCurveBuilder,
} from "./StateGraphLab.ts"

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

const branchingGraph = (): StateGraph => ({
  atomId: 1,
  atomLabel: "Branching",
  currentStateId: 1,
  fields: [],
  reachableStateIds: [1, 2, 3, 4, 5],
  src: "owner/branching",
  states: [
    {id: 1, name: "root", position: 0, current: true},
    {id: 2, name: "left", position: 1, current: false},
    {id: 3, name: "right", position: 2, current: false},
    {id: 4, name: "shared", position: 3, current: false},
    {id: 5, name: "cycle", position: 4, current: false},
  ],
  transitions: [
    {id: 11, fromStateId: 1, toStateId: 2, position: 0, conditions: []},
    {id: 12, fromStateId: 1, toStateId: 3, position: 1, conditions: []},
    {id: 13, fromStateId: 2, toStateId: 4, position: 2, conditions: []},
    {id: 14, fromStateId: 3, toStateId: 4, position: 3, conditions: []},
    {id: 15, fromStateId: 4, toStateId: 5, position: 4, conditions: []},
    {id: 16, fromStateId: 5, toStateId: 4, position: 5, conditions: []},
  ],
  sleeves: [
    {
      id: "left-path",
      rootStateId: 1,
      stateIds: [1, 2, 4, 5],
      transitionIds: [11, 13, 15, 16],
      end: {kind: "cycle", targetStateId: 4},
    },
    {
      id: "right-path",
      rootStateId: 1,
      stateIds: [1, 3, 4, 5],
      transitionIds: [12, 14, 15, 16],
      end: {kind: "cycle", targetStateId: 4},
    },
  ],
})

describe("State Graph playground branch lanes", () => {
  test("keeps every path in its own lane after a split", () => {
    const layout = buildStateGraphBranchLayout(branchingGraph(), 1)

    expect(layout.levels.map((level) => level.nodeIds.length)).toEqual([
      1,
      2,
      2,
      2,
    ])
    expect(layout.nodes.filter((node) => node.stateId === 4)).toHaveLength(2)
    expect(layout.nodes.filter((node) => node.stateId === 5)).toHaveLength(2)

    const branchLanes = layout.nodes
      .filter((node) => node.step === 1)
      .map((node) => node.y)
      .sort((left, right) => left - right)
    expect(branchLanes).toEqual([-7.5, 7.5])
    for (const step of [2, 3]) {
      expect(
        layout.nodes
          .filter((node) => node.step === step)
          .map((node) => node.y)
          .sort((left, right) => left - right),
      ).toEqual(branchLanes)
    }
  })

  test("closes every cycle inside the lane that produced it", () => {
    const layout = buildStateGraphBranchLayout(branchingGraph(), 1)
    const nodeById = new Map(
      layout.nodes.map((layoutNode) => [layoutNode.id, layoutNode] as const),
    )
    const returning = layout.edges.filter((layoutEdge) => layoutEdge.returning)

    expect(returning).toHaveLength(2)
    for (const layoutEdge of returning) {
      const from = nodeById.get(layoutEdge.fromNodeId)
      const to = nodeById.get(layoutEdge.toNodeId)
      expect(from?.stateId).toBe(5)
      expect(to?.stateId).toBe(4)
      expect(from?.y).toBe(to?.y)
    }
  })

  test("keeps one stable color for repeated path occurrences", () => {
    const layout = buildStateGraphBranchLayout(branchingGraph(), 1)
    for (const stateId of [4, 5]) {
      const occurrences = layout.nodes.filter((node) => node.stateId === stateId)
      expect(new Set(occurrences.map((node) => node.color.join(","))).size).toBe(1)
    }
  })
})
