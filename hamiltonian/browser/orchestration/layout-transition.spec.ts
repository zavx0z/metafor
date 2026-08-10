import {describe, expect, test} from "bun:test"
import {validatePositionedNodeSystem} from "@ui/node/validation"
import type {PositionedNodeSystem} from "@ui/node/types"
import {
  easeHamiltonianLayoutTransition,
  hamiltonianLayoutGeometryChanged,
  interpolateHamiltonianNodePositions,
} from "./layout-transition.ts"

const node = (id: string, x: number, y: number) => ({
  node: {id, title: id},
  rect: {x, y, w: 100, h: 60},
  ports: [],
})

const layout = (nodes: PositionedNodeSystem["nodes"]): PositionedNodeSystem => ({
  bounds: {x: 0, y: 0, w: 800, h: 600},
  nodes,
  edges: [],
})

describe("Hamiltonian topology layout transition", () => {
  test("moves surviving nodes between complete recalculated layouts", () => {
    const previous = layout([node("a", 10, 20), node("removed", 30, 40)])
    const target = layout([node("a", 210, 120), node("inserted", 500, 300)])

    const start = interpolateHamiltonianNodePositions(previous, target, 0)
    const middle = interpolateHamiltonianNodePositions(previous, target, 0.5)
    const end = interpolateHamiltonianNodePositions(previous, target, 1)

    expect(start.nodes.map(({node, rect}) => [node.id, rect.x, rect.y])).toEqual([
      ["a", 10, 20],
      ["inserted", 500, 300],
    ])
    expect(middle.nodes.map(({node, rect}) => [node.id, rect.x, rect.y])).toEqual([
      ["a", 110, 70],
      ["inserted", 500, 300],
    ])
    expect(end).toBe(target)
  })

  test("uses a bounded smooth ease-out curve", () => {
    expect(easeHamiltonianLayoutTransition(-1)).toBe(0)
    expect(easeHamiltonianLayoutTransition(0.5)).toBe(0.875)
    expect(easeHamiltonianLayoutTransition(2)).toBe(1)
  })

  test("does not move the canvas when a runtime incarnation replaces the same visual slot", () => {
    const previous = layout([node("service-worker:old", 40, 80), node("page", 300, 120)])
    const replacement = layout([node("service-worker:new", 40, 80), node("page", 300, 120)])

    expect(hamiltonianLayoutGeometryChanged(previous, replacement)).toBe(false)
    expect(hamiltonianLayoutGeometryChanged(previous, layout([
      node("service-worker:new", 60, 80),
      node("page", 300, 120),
    ]))).toBe(true)
  })

  test("keeps a newly observed child inside its moving owner", () => {
    const previous = layout([{
      node: {id: "page", title: "Page"},
      rect: {x: 10, y: 20, w: 200, h: 200},
      ports: [],
    }])
    const target = layout([
      {node: {id: "page", title: "Page"}, rect: {x: 210, y: 120, w: 200, h: 200}, ports: []},
      {node: {id: "rtc", parentId: "page", title: "RTC"}, rect: {x: 230, y: 220, w: 160, h: 80}, ports: []},
    ])

    const start = interpolateHamiltonianNodePositions(previous, target, 0)
    expect(start.nodes[0]!.rect.x).toBe(10)
    expect(start.nodes[1]!.rect).toEqual({x: 30, y: 120, w: 160, h: 80})
  })

  test("interpolates owner size and surviving child geometry as one valid containment chain", () => {
    const previous = layout([
      {node: {id: "page", title: "Page"}, rect: {x: 10, y: 20, w: 220, h: 360}, ports: []},
      {
        node: {id: "worker", parentId: "page", title: "Worker"},
        rect: {x: 30, y: 270, w: 180, h: 90},
        ports: [],
      },
    ])
    const target = layout([
      {node: {id: "page", title: "Page"}, rect: {x: 210, y: 120, w: 180, h: 220}, ports: []},
      {
        node: {id: "worker", parentId: "page", title: "Worker"},
        rect: {x: 230, y: 230, w: 140, h: 80},
        ports: [],
      },
    ])

    for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
      expect(() => validatePositionedNodeSystem(
        interpolateHamiltonianNodePositions(previous, target, progress),
      )).not.toThrow()
    }
  })

  test("maps a new child into the previous owner before both grow toward target geometry", () => {
    const previous = layout([
      {node: {id: "page", title: "Page"}, rect: {x: 10, y: 20, w: 120, h: 100}, ports: []},
    ])
    const target = layout([
      {node: {id: "page", title: "Page"}, rect: {x: 210, y: 120, w: 260, h: 360}, ports: []},
      {
        node: {id: "worker", parentId: "page", title: "Worker"},
        rect: {x: 250, y: 350, w: 180, h: 90},
        ports: [],
      },
    ])

    for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
      expect(() => validatePositionedNodeSystem(
        interpolateHamiltonianNodePositions(previous, target, progress),
      )).not.toThrow()
    }
  })

  test("interpolates complete layout bounds and routes instead of grafting moving endpoints onto target bends", () => {
    const previous: PositionedNodeSystem = {
      bounds: {x: 0, y: 0, w: 600, h: 300},
      nodes: [
        {...node("a", 10, 20), ports: [{port: {id: "out", parameterId: "out", direction: "out"}, center: {x: 110, y: 50}}]},
        {...node("b", 300, 20), ports: [{port: {id: "in", parameterId: "in", direction: "in"}, center: {x: 300, y: 50}}]},
      ],
      edges: [{
        edge: {id: "edge", source: {nodeId: "a", portId: "out"}, target: {nodeId: "b", portId: "in"}},
        points: [{x: 114, y: 50}, {x: 220, y: 50}, {x: 296, y: 50}],
      }],
    }
    const target: PositionedNodeSystem = {
      bounds: {x: 0, y: 0, w: 360, h: 700},
      nodes: [
        {...node("a", 100, 100), ports: [{port: {id: "out", parameterId: "out", direction: "out"}, center: {x: 200, y: 130}}]},
        {...node("b", 100, 400), ports: [{port: {id: "in", parameterId: "in", direction: "in"}, center: {x: 100, y: 430}}]},
      ],
      edges: [{
        edge: {id: "edge", source: {nodeId: "a", portId: "out"}, target: {nodeId: "b", portId: "in"}},
        points: [{x: 204, y: 130}, {x: 250, y: 130}, {x: 250, y: 430}, {x: 96, y: 430}],
      }],
    }

    const start = interpolateHamiltonianNodePositions(previous, target, 0)
    const middle = interpolateHamiltonianNodePositions(previous, target, 0.5)
    expect(start.bounds).toEqual(previous.bounds)
    expect(middle.bounds).toEqual({x: 0, y: 0, w: 480, h: 500})
    expect(start.edges[0]!.points).toHaveLength(4)
    expect(middle.edges[0]!.points).toHaveLength(4)
    expect(middle.edges[0]!.points[0]).toEqual({x: 159, y: 90})
    expect(middle.edges[0]!.points.at(-1)).toEqual({x: 196, y: 240})
  })

  test("reveals a new edge only with its completed target route", () => {
    const previous = layout([node("a", 10, 20), node("b", 300, 20)])
    const target: PositionedNodeSystem = {
      ...layout([node("a", 100, 100), node("b", 100, 400)]),
      edges: [{
        edge: {id: "new", source: {nodeId: "a", portId: "out"}, target: {nodeId: "b", portId: "in"}},
        points: [{x: 200, y: 130}, {x: 150, y: 400}],
      }],
    }
    expect(interpolateHamiltonianNodePositions(previous, target, 0.5).edges).toEqual([])
    expect(interpolateHamiltonianNodePositions(previous, target, 1).edges).toBe(target.edges)
  })
})
