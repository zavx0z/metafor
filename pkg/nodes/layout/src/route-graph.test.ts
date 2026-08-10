import {describe, expect, test} from "bun:test"
import {
  routeGraph,
  validateRouteGraphResult,
} from "./route-graph.ts"
import type {RouteGraphInput} from "../types/routing.ts"

const base = (input: Omit<RouteGraphInput, "direction" | "unitsPerPixel" | "clearance" | "viewport">): RouteGraphInput => ({
  direction: "DOWN",
  unitsPerPixel: 1,
  clearance: 10,
  viewport: {width: 500, height: 400},
  ...input,
})

describe("rectilinear semantic-edge router", () => {
  test("connects exact EAST to WEST sockets directly when the row is visible", () => {
    const input = base({
      bounds: {x: 0, y: 0, w: 500, h: 300},
      nodes: [
        {id: "source", rect: {x: 40, y: 100, w: 60, h: 60}},
        {id: "target", rect: {x: 220, y: 100, w: 60, h: 60}},
      ],
      ports: [
        {id: "out", nodeId: "source", center: {x: 100, y: 130}, side: "EAST", direction: "out"},
        {id: "in", nodeId: "target", center: {x: 220, y: 130}, side: "WEST", direction: "in"},
      ],
      edges: [{id: "edge", sourcePortId: "out", targetPortId: "in"}],
    })
    const result = routeGraph(input)
    expect(result.sections[0]).toEqual({
      edgeId: "edge",
      startPoint: {x: 100, y: 130},
      bendPoints: [],
      endPoint: {x: 220, y: 130},
    })
    expect(result.metrics.hardViolations).toEqual([])
  })

  test("converges facing terminal zones inside a one-pitch node gap", () => {
    const input = base({
      bounds: {x: -56, y: -56, w: 340, h: 252},
      nodes: [
        {id: "source", rect: {x: 0, y: 0, w: 100, h: 100}},
        {id: "target", rect: {x: 110, y: 40, w: 100, h: 100}},
      ],
      ports: [
        {id: "source:out", nodeId: "source", center: {x: 100, y: 40}, side: "EAST", direction: "out"},
        {id: "target:in", nodeId: "target", center: {x: 110, y: 80}, side: "WEST", direction: "in"},
      ],
      edges: [{id: "edge", sourcePortId: "source:out", targetPortId: "target:in"}],
    })

    expect(routeGraph(input).sections[0]).toEqual({
      edgeId: "edge",
      startPoint: {x: 100, y: 40},
      bendPoints: [{x: 105, y: 40}, {x: 105, y: 80}],
      endPoint: {x: 110, y: 80},
    })
    expect(validateRouteGraphResult(input, routeGraph(input))).toEqual([])
  })

  test("does not fake EAST attachment with a hidden terminal-zone reversal", () => {
    const input = base({
      bounds: {x: -30, y: -30, w: 270, h: 260},
      nodes: [
        {id: "source", rect: {x: 0, y: 0, w: 100, h: 100}},
        {id: "target", rect: {x: 110, y: 100, w: 100, h: 100}},
      ],
      ports: [
        {id: "source:a", nodeId: "source", center: {x: 100, y: 40}, side: "EAST", direction: "out"},
        {id: "source:b", nodeId: "source", center: {x: 100, y: 80}, side: "EAST", direction: "out"},
        {id: "target:a", nodeId: "target", center: {x: 110, y: 160}, side: "WEST", direction: "in"},
        {id: "target:b", nodeId: "target", center: {x: 110, y: 120}, side: "WEST", direction: "in"},
      ],
      edges: [
        {id: "a-prior", sourcePortId: "source:a", targetPortId: "target:a"},
        {id: "b-current", sourcePortId: "source:b", targetPortId: "target:b"},
      ],
    })

    const result = routeGraph(input)
    const section = result.sections.find(({edgeId}) => edgeId === "b-current")!
    const points = [section.startPoint, ...section.bendPoints, section.endPoint]
    expect(points[1]!.x).toBeGreaterThan(points[0]!.x)
    expect(validateRouteGraphResult(input, result)).toEqual([])
  })

  test("finds the required four-turn route when source is right of target", () => {
    const input = base({
      bounds: {x: 0, y: 0, w: 500, h: 400},
      nodes: [
        {id: "source", rect: {x: 300, y: 80, w: 50, h: 60}},
        {id: "target", rect: {x: 100, y: 220, w: 50, h: 60}},
      ],
      ports: [
        {id: "out", nodeId: "source", center: {x: 350, y: 110}, side: "EAST", direction: "out"},
        {id: "in", nodeId: "target", center: {x: 100, y: 250}, side: "WEST", direction: "in"},
      ],
      edges: [{id: "reverse", sourcePortId: "out", targetPortId: "in"}],
    })
    const first = routeGraph(input)
    const permuted = routeGraph({...input, nodes: [...input.nodes].reverse(), ports: [...input.ports].reverse()})
    expect(first.metrics.perEdge[0]?.turns).toBe(4)
    expect(first.metrics.hardViolations).toEqual([])
    expect(permuted).toEqual(first)
  })

  test("crosses an intermediate compound boundary only through EAST", () => {
    const input = base({
      bounds: {x: 0, y: 0, w: 600, h: 400},
      nodes: [
        {id: "compound", rect: {x: 30, y: 40, w: 220, h: 260}},
        {id: "source", parentId: "compound", rect: {x: 80, y: 120, w: 70, h: 60}},
        {id: "target", rect: {x: 400, y: 210, w: 70, h: 60}},
      ],
      ports: [
        {id: "out", nodeId: "source", center: {x: 150, y: 150}, side: "EAST", direction: "out"},
        {id: "in", nodeId: "target", center: {x: 400, y: 240}, side: "WEST", direction: "in"},
      ],
      edges: [{id: "compound-edge", sourcePortId: "out", targetPortId: "in"}],
    })
    const result = routeGraph(input)
    expect(validateRouteGraphResult(input, result)).toEqual([])
    const points = [result.sections[0]!.startPoint, ...result.sections[0]!.bendPoints, result.sections[0]!.endPoint]
    const crossing = points.slice(1).find((point, index) => {
      const previous = points[index]!
      return previous.y === point.y && previous.x <= 250 && point.x > 250
    })
    expect(crossing).toBeDefined()
  })
})
