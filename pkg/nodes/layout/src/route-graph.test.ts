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

  test("preserves two and three parallel lane ranks through all four turns of a shared U corridor", () => {
    for (const laneCount of [2, 3]) {
      const ranks = Array.from({length: laneCount}, (_, rank) => rank)
      const input = base({
        bounds: {x: 0, y: 0, w: 600, h: 420},
        nodes: [
          {id: "target", rect: {x: 100, y: 0, w: 100, h: 140}},
          {id: "source", rect: {x: 360, y: 0, w: 100, h: 140}},
        ],
        ports: ranks.flatMap((rank) => [
          {id: `source:${rank}`, nodeId: "source", center: {x: 460, y: 40 + rank * 30}, side: "EAST" as const, direction: "out" as const},
          {id: `target:${rank}`, nodeId: "target", center: {x: 100, y: 40 + rank * 30}, side: "WEST" as const, direction: "in" as const},
        ]),
        edges: ranks.map((rank) => ({
          id: `edge:${rank}`,
          sourcePortId: `source:${rank}`,
          targetPortId: `target:${rank}`,
        })),
      })

      const first = routeGraph(input)
      const repeated = routeGraph(input)
      const permuted = routeGraph({
        ...input,
        nodes: [...input.nodes].reverse(),
        ports: [...input.ports].reverse(),
        edges: [...input.edges].reverse(),
      })

      expect(first.metrics.crossings).toBe(0)
      expect(first.metrics.maxCrossings).toBe(0)
      expect(first.sections.every(({bendPoints}) => bendPoints.length === 4)).toBeTrue()
      expect(validateRouteGraphResult(input, first)).toEqual([])
      expect(repeated).toEqual(first)
      expect(permuted).toEqual(first)
    }
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

  test("keeps a nested endpoint route out of its ancestor content band", () => {
    for (const direction of ["RIGHT", "DOWN"] as const) {
      const input: RouteGraphInput = {
        ...base({
          bounds: {x: 0, y: 0, w: 600, h: 400},
          nodes: [
            {
              id: "compound",
              rect: {x: 30, y: 40, w: 270, h: 280},
              contentRect: {x: 30, y: 40, w: 270, h: 80},
            },
            {id: "source", parentId: "compound", rect: {x: 80, y: 210, w: 80, h: 60}},
            {id: "target", rect: {x: 400, y: 70, w: 80, h: 60}},
          ],
          ports: [
            {id: "out", nodeId: "source", center: {x: 160, y: 240}, side: "EAST", direction: "out"},
            {id: "in", nodeId: "target", center: {x: 400, y: 100}, side: "WEST", direction: "in"},
          ],
          edges: [{id: "nested-edge", sourcePortId: "out", targetPortId: "in"}],
        }),
        direction,
      }

      const result = routeGraph(input)
      const section = result.sections[0]!
      const points = [section.startPoint, ...section.bendPoints, section.endPoint]
      expect(points.slice(1).some((point, index) => segmentIntersectsOpenRect(
        points[index]!,
        point,
        {x: 30, y: 40, w: 270, h: 80},
      ))).toBeFalse()
      expect(validateRouteGraphResult(input, result)).toEqual([])
    }
  })

  test("fans out several edges from one shared output port inside a compound", () => {
    const input = base({
      bounds: {x: 0, y: 0, w: 720, h: 720},
      nodes: [
        {
          id: "compound",
          rect: {x: 40, y: 40, w: 640, h: 640},
          contentRect: {x: 40, y: 40, w: 640, h: 70},
        },
        {id: "source", parentId: "compound", rect: {x: 270, y: 150, w: 100, h: 80}},
        {id: "target:a", parentId: "compound", rect: {x: 100, y: 470, w: 100, h: 80}},
        {id: "target:b", parentId: "compound", rect: {x: 310, y: 470, w: 100, h: 80}},
        {id: "target:c", parentId: "compound", rect: {x: 520, y: 470, w: 100, h: 80}},
      ],
      ports: [
        {id: "source:IPC:out", nodeId: "source", center: {x: 370, y: 190}, side: "EAST", direction: "out"},
        {id: "target:a:IPC:in", nodeId: "target:a", center: {x: 100, y: 510}, side: "WEST", direction: "in"},
        {id: "target:b:IPC:in", nodeId: "target:b", center: {x: 310, y: 510}, side: "WEST", direction: "in"},
        {id: "target:c:IPC:in", nodeId: "target:c", center: {x: 520, y: 510}, side: "WEST", direction: "in"},
      ],
      edges: [
        {id: "ipc:a", sourcePortId: "source:IPC:out", targetPortId: "target:a:IPC:in"},
        {id: "ipc:b", sourcePortId: "source:IPC:out", targetPortId: "target:b:IPC:in"},
        {id: "ipc:c", sourcePortId: "source:IPC:out", targetPortId: "target:c:IPC:in"},
      ],
    })

    const result = routeGraph(input)
    expect(result.sections).toHaveLength(3)
    expect(result.sections.every(({startPoint}) =>
      startPoint.x === 370 && startPoint.y === 190)).toBeTrue()
    for (let leftIndex = 0; leftIndex < result.sections.length; leftIndex += 1) {
      const left = result.sections[leftIndex]!
      const leftPoints = [left.startPoint, ...left.bendPoints, left.endPoint]
      for (let rightIndex = leftIndex + 1; rightIndex < result.sections.length; rightIndex += 1) {
        const right = result.sections[rightIndex]!
        const rightPoints = [right.startPoint, ...right.bendPoints, right.endPoint]
        let sharedStubObserved = false
        for (let li = 1; li < leftPoints.length; li += 1) {
          for (let ri = 1; ri < rightPoints.length; ri += 1) {
            const [leftFrom, leftTo] = [leftPoints[li - 1]!, leftPoints[li]!]
            const [rightFrom, rightTo] = [rightPoints[ri - 1]!, rightPoints[ri]!]
            if (leftFrom.y === leftTo.y && rightFrom.y === rightTo.y && leftFrom.y === rightFrom.y) {
              const overlapFrom = Math.max(Math.min(leftFrom.x, leftTo.x), Math.min(rightFrom.x, rightTo.x))
              const overlapTo = Math.min(Math.max(leftFrom.x, leftTo.x), Math.max(rightFrom.x, rightTo.x))
              if (overlapFrom >= overlapTo) continue
              expect(leftFrom.y).toBe(190)
              expect(overlapFrom).toBeGreaterThanOrEqual(370)
              expect(overlapTo).toBeLessThanOrEqual(380)
              sharedStubObserved = true
            } else if (leftFrom.x === leftTo.x && rightFrom.x === rightTo.x && leftFrom.x === rightFrom.x) {
              const overlapFrom = Math.max(Math.min(leftFrom.y, leftTo.y), Math.min(rightFrom.y, rightTo.y))
              const overlapTo = Math.min(Math.max(leftFrom.y, leftTo.y), Math.max(rightFrom.y, rightTo.y))
              expect(overlapFrom).toBeGreaterThanOrEqual(overlapTo)
            }
          }
        }
        expect(sharedStubObserved).toBeTrue()
      }
    }
    expect(validateRouteGraphResult(input, result)).toEqual([])
  })
})

function segmentIntersectsOpenRect(
  from: Readonly<{x: number; y: number}>,
  to: Readonly<{x: number; y: number}>,
  rect: Readonly<{x: number; y: number; w: number; h: number}>,
): boolean {
  if (from.y === to.y) {
    return from.y > rect.y && from.y < rect.y + rect.h &&
      Math.max(Math.min(from.x, to.x), rect.x) < Math.min(Math.max(from.x, to.x), rect.x + rect.w)
  }
  return from.x > rect.x && from.x < rect.x + rect.w &&
    Math.max(Math.min(from.y, to.y), rect.y) < Math.min(Math.max(from.y, to.y), rect.y + rect.h)
}
